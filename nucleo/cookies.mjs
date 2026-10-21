#!/usr/bin/env node
// Captura y administra storageState de Playwright con una clave de archivo
// estable por hostname y un origen completo validado por separado.

import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import readline from "node:readline";

const RAIZ_APP = resolve(import.meta.dirname, "..");
const META = "__repofibe";

function analizarOrigen(dominio) {
  const entrada = typeof dominio === "string" ? dominio.trim() : "";
  if (!entrada || /[\\\0]/.test(entrada)) {
    throw new Error("Dominio u origen inválido para el perfil de autenticación");
  }

  const candidato = /^[a-z][a-z\d+.-]*:\/\//i.test(entrada) ? entrada : `https://${entrada}`;
  let url;
  try { url = new URL(candidato); }
  catch { throw new Error("Dominio u origen inválido para el perfil de autenticación"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("El perfil requiere un origen HTTP(S) sin credenciales en la URL");
  }
  return { url, origen: url.origin, host: url.hostname.toLowerCase() };
}

function claveHostname(dominio) {
  let host = analizarOrigen(dominio).host.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  host = host.replace(/^www\./i, "").toLowerCase().replaceAll(":", "_");
  if (!host || !/^[a-z0-9._-]+$/i.test(host)) {
    throw new Error("El hostname no se puede convertir en una clave de archivo segura");
  }
  // Windows reserva estos nombres incluso cuando tienen extensión.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(host)) host = `_${host}`;
  return host;
}

function mismoPath(a, b) {
  return relative(a, b) === "";
}

function pathContenido(raiz, ruta) {
  const relativo = relative(raiz, ruta);
  return relativo === "" || (relativo !== ".." && !relativo.startsWith(`..${sep}`) && !isAbsolute(relativo));
}

function existeSinSymlink(ruta, esperado) {
  let info;
  try { info = lstatSync(ruta); }
  catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`Se rechazó una ruta de perfil con symlink: ${ruta}`);
  if (esperado === "directorio" && !info.isDirectory()) throw new Error(`La ruta de autenticación no es un directorio: ${ruta}`);
  if (esperado === "archivo" && (!info.isFile() || info.nlink > 1)) throw new Error(`Se rechazó un archivo de perfil no regular: ${ruta}`);
  return true;
}

function asegurarDirectorioReal(ruta) {
  if (!existsSync(ruta)) mkdirSync(ruta);
  existeSinSymlink(ruta, "directorio");
  const real = realpathSync(ruta);
  if (!mismoPath(resolve(ruta), resolve(real))) throw new Error(`La ruta de autenticación sale de su ubicación esperada: ${ruta}`);
  return real;
}

function dirAuth(dirBase) {
  const baseEntrada = resolve(dirBase || RAIZ_APP);
  mkdirSync(baseEntrada, { recursive: true });
  const baseReal = realpathSync(baseEntrada);
  const fabricaEsperada = resolve(baseReal, ".fabrica");
  const fabrica = asegurarDirectorioReal(fabricaEsperada);
  if (!pathContenido(baseReal, fabrica)) throw new Error("La carpeta .fabrica sale del directorio del proyecto");
  const authEsperada = resolve(fabrica, "auth");
  const auth = asegurarDirectorioReal(authEsperada);
  if (!pathContenido(fabrica, auth)) throw new Error("La carpeta auth sale de .fabrica");
  return auth;
}

function rutaAuth(dominio, dirBase) {
  const dir = dirAuth(dirBase);
  const ruta = resolve(dir, `${claveHostname(dominio)}.json`);
  if (!pathContenido(dir, ruta) || dirname(ruta) !== dir) throw new Error("El archivo de perfil sale de .fabrica/auth");
  existeSinSymlink(ruta, "archivo");
  return ruta;
}

function rutaPerfilTemporal(dominio, dirBase) {
  const dir = dirAuth(dirBase);
  const ruta = resolve(dir, `perfil-${claveHostname(dominio)}-${process.pid}-${randomUUID()}`);
  if (!pathContenido(dir, ruta) || dirname(ruta) !== dir) throw new Error("El perfil temporal sale de .fabrica/auth");
  return ruta;
}

function normalizarDominio(dominio) {
  return claveHostname(dominio);
}

function normalizarHostCookie(dominio) {
  return String(dominio || "").replace(/^\./, "").replace(/^\[|\]$/g, "").toLowerCase();
}

function cookieAplicaAlHost(cookie, host) {
  const dominio = normalizarHostCookie(cookie?.domain);
  if (!dominio) return false;
  if (host === dominio) return true;
  return !isIP(host.replace(/^\[|\]$/g, "")) && host.endsWith(`.${dominio}`);
}

function origenCoincide(valor, origenObjetivo) {
  try { return analizarOrigen(valor).origen === origenObjetivo; }
  catch { return false; }
}

function limpiarStorageState(state, { origen, host }) {
  const cookies = Array.isArray(state?.cookies) ? state.cookies.filter((cookie) => cookieAplicaAlHost(cookie, host)) : [];
  const origins = Array.isArray(state?.origins)
    ? state.origins.filter((item) => origenCoincide(item?.origin, origen)).map((item) => ({
      origin: origen,
      localStorage: Array.isArray(item.localStorage) ? item.localStorage : [],
    }))
    : [];
  return { cookies, origins };
}

function leerPerfil(ruta, dominio) {
  if (!existeSinSymlink(ruta, "archivo")) return null;
  const objetivo = analizarOrigen(dominio);
  const almacenado = JSON.parse(readFileSync(ruta, "utf8"));
  if (!almacenado || typeof almacenado !== "object" || Array.isArray(almacenado)) {
    throw new Error(`storageState inválido en ${ruta}`);
  }
  const meta = almacenado[META];
  if (meta?.origin && meta.origin !== objetivo.origen) {
    throw new Error(`El perfil de ${claveHostname(dominio)} pertenece a ${meta.origin}, no a ${objetivo.origen}`);
  }
  // Los perfiles antiguos no tenían metadatos. Su archivo conserva la clave
  // hostname y Playwright guarda el origen completo de localStorage en origins[].
  // Aquí los origins ajenos se filtran, mientras que cookies respetan su
  // alcance estándar por dominio.
  return limpiarStorageState(almacenado, objetivo);
}

function escribirStorageState(ruta, valor) {
  const dir = dirname(ruta);
  const temporal = join(dir, `.${basename(ruta)}.${process.pid}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temporal, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(valor, null, 2), "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    // rename reemplaza la entrada final; nunca abre ni sigue un symlink destino.
    renameSync(temporal, ruta);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporal)) rmSync(temporal, { force: true });
  }
}

async function playwright() {
  try { return await import("playwright"); }
  catch { throw new Error("Playwright no está instalado en este proyecto — ejecuta: npm ci && npm run setup:chromium"); }
}

function esperarConfirmacion(contexto, entrada = process.stdin, salida = process.stdout) {
  const rl = readline.createInterface({ input: entrada, output: salida, terminal: Boolean(entrada.isTTY && salida.isTTY) });
  return new Promise((resolve) => {
    let finalizada = false;
    const terminar = (confirmada) => {
      if (finalizada) return;
      finalizada = true;
      contexto.off("close", alCerrar);
      rl.off("line", alResponder);
      rl.off("close", alCerrarEntrada);
      rl.close();
      resolve(confirmada);
    };
    const alCerrar = () => terminar(false);
    const alCerrarEntrada = () => terminar(false);
    const alResponder = (linea) => terminar(/^(s|si|sí|y|yes)$/i.test(linea.trim()));
    contexto.once("close", alCerrar);
    rl.on("line", alResponder);
    rl.once("close", alCerrarEntrada);
    salida.write("\nCuando termines de autenticarte, escribe s y pulsa Enter mientras Chromium sigue abierto.\n");
    salida.write("Cerrar la ventana, responder n o cerrar esta terminal cancela y conserva el perfil guardado anterior.\n\n");
  });
}

async function guardar(dominio, dirBase) {
  const objetivo = analizarOrigen(dominio);
  const norm = claveHostname(dominio);
  const archivo = rutaAuth(dominio, dirBase);
  const perfilDir = rutaPerfilTemporal(dominio, dirBase);
  const pw = await playwright();
  let ctx;
  let state = null;
  try {
    ctx = await pw.chromium.launchPersistentContext(
      perfilDir,
      { headless: false, viewport: { width: 1280, height: 720 } }
    );
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(objetivo.origen, { waitUntil: "domcontentloaded", timeout: 30000 });
    const confirmado = await esperarConfirmacion(ctx);
    if (!confirmado) {
      console.log("Captura cancelada. El storageState guardado anteriormente no se modificó.");
      return null;
    }
    // La lectura sucede antes de cerrar el contexto. Si falla o la ventana se
    // cerró primero, no se alcanza el reemplazo atómico del perfil anterior.
    state = await ctx.storageState();
    guardarEstado(dominio, state, dirBase);
    const filtrado = limpiarStorageState(state, objetivo);
    console.log(`storageState guardado para ${norm}: ${filtrado.cookies.length} cookies, ${filtrado.origins.length} origins → ${archivo}`);
    return state;
  } finally {
    try { await ctx?.close(); } catch { /* el usuario pudo cerrar Chromium */ }
    try { rmSync(perfilDir, { recursive: true, force: true }); } catch { /* solo limpieza del perfil temporal propio */ }
  }
}

function cargar(dominio, dirBase) {
  return leerPerfil(rutaAuth(dominio, dirBase), dominio);
}

function listar(dirBase) {
  const dir = dirAuth(dirBase);
  return readdirSync(dir)
    .filter((nombre) => nombre.endsWith(".json") && !nombre.startsWith("."))
    .map((nombre) => nombre.slice(0, -5));
}

function retirar(dominio, dirBase) {
  const ruta = rutaAuth(dominio, dirBase);
  if (!existeSinSymlink(ruta, "archivo")) return false;
  rmSync(ruta);
  return true;
}

function guardarEstado(dominio, state, dirBase) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("guardarEstado requiere un storageState ya exportado");
  }
  const objetivo = analizarOrigen(dominio);
  const ruta = rutaAuth(dominio, dirBase);
  const limpio = limpiarStorageState(state, objetivo);
  escribirStorageState(ruta, { ...limpio, [META]: { version: 1, origin: objetivo.origen } });
  return ruta;
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accion, dominio] = process.argv.slice(2);
  const dirBase = process.env.REPOFIBE_DIR || undefined;

  if (accion === "guardar" && dominio) {
    await guardar(dominio, dirBase);
  } else if (accion === "cargar" && dominio) {
    const state = cargar(dominio, dirBase);
    if (state) console.log(JSON.stringify(state));
    else console.log(`No hay storageState guardado para ${normalizarDominio(dominio)}`);
  } else if (accion === "listar") {
    const dominios = listar(dirBase);
    if (dominios.length === 0) console.log("No hay dominios con storageState guardado.");
    else dominios.forEach((d) => console.log(`  ${d}`));
  } else if (accion === "retirar" && dominio) {
    const ok = retirar(dominio, dirBase);
    console.log(ok ? `storageState de ${normalizarDominio(dominio)} eliminado.` : `No hay storageState para ${normalizarDominio(dominio)}.`);
  } else {
    console.log("Uso: node cookies.mjs <guardar|cargar|listar|retirar> [dominio]");
    console.log("  guardar <dominio>  → abre Chromium visible y espera confirmación explícita");
    console.log("  cargar <dominio>   → imprime el storageState del origen que coincide");
    console.log("  listar             → lista hostnames con storageState");
    console.log("  retirar <dominio>  → elimina el storageState del hostname");
    process.exit(1);
  }
}

export { guardar, guardarEstado, cargar, listar, retirar, dirAuth, normalizarDominio };
