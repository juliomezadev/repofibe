#!/usr/bin/env node
// Primitivas pequeñas para transacciones locales. No se decide que un lock
// expiró por su edad: solo se recupera si el dueño local comprobablemente murió.
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const HOST = hostname();
const RETRYABLE_RENAME = new Set(["EPERM", "EACCES", "EBUSY", "EEXIST"]);

function dormir(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function leerPropietario(ruta) {
  try {
    const valor = JSON.parse(readFileSync(ruta, "utf8"));
    if (valor && typeof valor.token === "string" && Number.isInteger(valor.pid) && typeof valor.hostname === "string") return valor;
  } catch {}
  return null;
}

function dueñoMuertoLocal(propietario) {
  if (!propietario || propietario.hostname.toLowerCase() !== HOST.toLowerCase() || propietario.pid < 1) return false;
  try {
    process.kill(propietario.pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function soltarArchivoPropio(ruta, token) {
  const propietario = leerPropietario(ruta);
  if (propietario?.token === token) {
    try { unlinkSync(ruta); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

// El lock reaper serializa solo la recuperación de dueños muertos. Si el
// proceso se cae mientras recupera, ese lock queda para revisión explícita.
function recuperarDueñoMuerto(rutaLock, propietarioEsperado) {
  const rutaReaper = `${rutaLock}.reaper`;
  const tokenReaper = randomUUID();
  let descriptor;
  try {
    descriptor = openSync(rutaReaper, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify({ token: tokenReaper, pid: process.pid, hostname: HOST, creado: new Date().toISOString() }));
    fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      // open("wx") prueba que este intento creó el reaper; solo limpia ese archivo.
      try { unlinkSync(rutaReaper); } catch (limpieza) { if (limpieza?.code !== "ENOENT") throw limpieza; }
    }
    if (error?.code === "EEXIST" || (process.platform === "win32" && error?.code === "EPERM")) return false;
    throw error;
  }

  try {
    const actual = leerPropietario(rutaLock);
    if (actual?.token !== propietarioEsperado.token || !dueñoMuertoLocal(actual)) return false;

    const cuarentena = `${rutaLock}.muerto-${randomUUID()}`;
    try { renameSync(rutaLock, cuarentena); }
    catch (error) { if (error?.code === "ENOENT") return true; throw error; }

    const movido = leerPropietario(cuarentena);
    if (movido?.token !== propietarioEsperado.token) {
      // Preserva cualquier lock que no sea el que acabábamos de inspeccionar.
      if (!existsSync(rutaLock)) renameSync(cuarentena, rutaLock);
      throw new Error(`Lock cambiado durante recuperación; revisar manualmente: ${rutaLock}`);
    }
    unlinkSync(cuarentena);
    return true;
  } finally {
    closeSync(descriptor);
    soltarArchivoPropio(rutaReaper, tokenReaper);
  }
}

/**
 * Ejecuta una transacción síncrona bajo un lock exclusivo entre procesos.
 * Lock corrupto, de otro host o con dueño vivo se conserva y vence por timeout;
 * su recuperación requiere verificar pid/host y actuar de forma explícita.
 * Nunca retires lock/reaper por antigüedad: confirma que el proceso dueño murió.
 */
export function conBloqueoExclusivoSync(rutaLock, transaccion, { timeoutMs = 15_000, pollMs = 25 } = {}) {
  if (typeof transaccion !== "function") throw new TypeError("transaccion debe ser una función");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs < 1) throw new RangeError("timeoutMs y pollMs inválidos");
  mkdirSync(dirname(rutaLock), { recursive: true });
  const limite = Date.now() + timeoutMs;
  let tokenAdquirido;

  while (true) {
    const token = randomUUID();
    const propietario = { token, pid: process.pid, hostname: HOST, creado: new Date().toISOString() };
    let descriptor;
    try {
      descriptor = openSync(rutaLock, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify(propietario));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      tokenAdquirido = token;
      break;
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch {}
        // La creación exclusiva demuestra que esta llamada puso el archivo.
        try { unlinkSync(rutaLock); } catch {}
      }
      // Windows puede informar EPERM durante la carrera create/delete del lock;
      // reintenta hasta el límite y solo interpreta un propietario si el lock existe.
      const contencion = error?.code === "EEXIST" || (process.platform === "win32" && error?.code === "EPERM");
      if (!contencion) throw error;

      const existente = leerPropietario(rutaLock);
      if (existente && dueñoMuertoLocal(existente)) {
        recuperarDueñoMuerto(rutaLock, existente);
        continue;
      }
      if (Date.now() >= limite) {
        const dueño = existente
          ? ` dueño pid=${existente.pid} host=${existente.hostname}`
          : " dueño ausente, corrupto o desconocido";
        throw new Error(`Tiempo agotado esperando el lock ${rutaLock};${dueño}. Verifica manualmente lock y reaper; retíralos solo después de confirmar que sus dueños terminaron.`);
      }
      dormir(Math.min(pollMs, Math.max(1, limite - Date.now())));
    }
  }

  const dueño = leerPropietario(rutaLock);
  try {
    if (dueño?.token !== tokenAdquirido) throw new Error(`No se pudo verificar la propiedad del lock; se conserva para recuperación explícita: ${rutaLock}`);
    const resultado = transaccion();
    if (resultado && typeof resultado.then === "function") throw new TypeError("la transacción con lock debe ser síncrona");
    return resultado;
  } finally {
    soltarArchivoPropio(rutaLock, tokenAdquirido);
  }
}

/** Escribe en un temporal exclusivo al lado del destino y luego renombra. */
export function escribirAtomicoSync(rutaDestino, contenido, { retryMs = 2_000 } = {}) {
  const directorio = dirname(rutaDestino);
  mkdirSync(directorio, { recursive: true });
  const rutaTemporal = join(directorio, `.${basename(rutaDestino)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor;
  let temporalCreado = false;
  try {
    descriptor = openSync(rutaTemporal, "wx", 0o600);
    temporalCreado = true;
    writeFileSync(descriptor, contenido);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    const fin = Date.now() + retryMs;
    while (true) {
      try {
        renameSync(rutaTemporal, rutaDestino);
        temporalCreado = false;
        return;
      } catch (error) {
        if (!RETRYABLE_RENAME.has(error?.code) || Date.now() >= fin) throw error;
        dormir(Math.min(40, Math.max(1, fin - Date.now())));
      }
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporalCreado) {
      try { unlinkSync(rutaTemporal); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
  }
}
