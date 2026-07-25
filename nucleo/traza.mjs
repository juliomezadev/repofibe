#!/usr/bin/env node
// traza.mjs — Telemetría local cero-dependencias para repofibe.
//
// Dos usos, distintos a propósito:
//
//   1. `withTrace(nombre, fn)` — para procesos con vida: envuelve funciones,
//      propaga contexto con AsyncLocalStorage y escribe en lotes asíncronos.
//      Lo usan nucleo/memoria.mjs, navegador.mjs y qaonline.mjs.
//
//   2. `registrar(evento)` — para procesos efímeros (los hooks): un evento,
//      escritura SÍNCRONA, y a morir. Batchear en un proceso que vive 30 ms
//      pierde datos; aquí no se batchea.
//
// ── Tres reglas que no se negocian ──────────────────────────────────────────
//
// A. NUNCA se registra contenido, solo metadatos. Ni comandos, ni rutas de
//    archivo, ni argumentos, ni prompts. Un comando de shell puede llevar una
//    credencial dentro, y esto escribe a disco. `registrar` filtra por lista
//    blanca: lo que no esté en CAMPOS_PERMITIDOS se descarta aunque el que
//    llama insista. Saber QUÉ herramienta se usó basta para medir uso; saber
//    con qué argumentos no aporta y sí arriesga.
//
// B. Importar este módulo no cambia el comportamiento del proceso. Antes,
//    importarlo instalaba handlers de `uncaughtException` (que forzaban
//    exit 1) y de SIGINT/SIGTERM. Eso es fatal para un hook fail-open:
//    guardia.mjs debe salir 0 pase lo que pase, y heredar un exit 1 ajeno
//    rompería la sesión del usuario. Esos handlers son ahora opt-in vía
//    `instalarRedDeSeguridad()`. Solo queda el de 'exit', que es sincrónico
//    y no puede alterar el código de salida.
//
// C. Todo falla en silencio. Si la telemetría no puede escribir, el trabajo
//    del usuario sigue. Una traza que rompe la sesión es peor que ninguna.
//
// Los datos son del usuario y se quedan en `.fabrica/traza.jsonl` (gitignorado).
// Cero telemetría remota, por diseño — ver ARQUITECTURA.md.
// Se apaga con `.fabrica/traza.json` → {"activo": false}.
//
// Uso CLI:
//   node nucleo/traza.mjs ver [n]              últimos n eventos (por defecto 20)
//   node nucleo/traza.mjs inspeccionar <id>    árbol de una traza

import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";

// La ruta se resuelve EN CADA LLAMADA, no al importar: un hook recibe su cwd
// en el payload y puede no coincidir con el cwd del proceso.
export function rutaTraza(raiz) {
  return join(raiz || process.env.REPOFIBE_TRAZA_DIR || process.cwd(), ".fabrica", "traza.jsonl");
}

function trazaActiva(raiz) {
  try {
    const cfg = join(raiz || process.env.REPOFIBE_TRAZA_DIR || process.cwd(), ".fabrica", "traza.json");
    if (!existsSync(cfg)) return true; // activa por defecto, local y apagable
    return JSON.parse(readFileSync(cfg, "utf8")).activo !== false;
  } catch {
    return true;
  }
}

// ── 1. Contexto propagado sin prop drilling ─────────────────────────────────
export const traceContext = new AsyncLocalStorage();

function getId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── 2. Registro de evento único, síncrono (hooks) ───────────────────────────
// Lista blanca estricta. Cualquier campo fuera de aquí se descarta: es la
// diferencia entre "medir uso" y "escribir un log de todo lo que hiciste".
const CAMPOS_PERMITIDOS = ["ev", "n", "d", "st", "dur", "host"];
const LARGO_MAX = 80;

function sanear(valor) {
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  return String(valor).replace(/\s+/g, " ").trim().slice(0, LARGO_MAX);
}

/**
 * Registra un evento y escribe de inmediato. Para procesos efímeros.
 * Devuelve true si escribió, false si estaba apagada o falló (nunca lanza).
 *
 * @param {{ev:string, n?:string, d?:string, st?:number, dur?:number, host?:string}} evento
 * @param {{raiz?:string}} [opciones] raíz del proyecto (cwd del hook)
 */
export function registrar(evento, opciones = {}) {
  try {
    const raiz = opciones.raiz;
    if (!trazaActiva(raiz)) return false;

    const limpio = { ts: Date.now() };
    for (const campo of CAMPOS_PERMITIDOS) {
      if (evento[campo] !== undefined && evento[campo] !== null) limpio[campo] = sanear(evento[campo]);
    }
    if (!limpio.ev) return false; // sin tipo de evento no hay nada que medir

    const archivo = rutaTraza(raiz);
    mkdirSync(dirname(archivo), { recursive: true });
    appendFileSync(archivo, JSON.stringify(limpio) + "\n", "utf8");
    return true;
  } catch {
    return false; // regla C: la telemetría jamás interrumpe el trabajo
  }
}

// ── 3. Buffer asíncrono (procesos con vida) ─────────────────────────────────
const tracerEvents = new EventEmitter();
let buffer = [];
let escribiendo = false;
let timeoutFlush = null;

export function flushBufferAsync() {
  if (buffer.length === 0 || escribiendo) return;
  escribiendo = true;
  if (timeoutFlush) clearTimeout(timeoutFlush);

  const volcado = buffer.join("\n") + "\n";
  buffer = [];

  try {
    const archivo = rutaTraza();
    mkdirSync(dirname(archivo), { recursive: true });
    appendFile(archivo, volcado, "utf8", (err) => {
      escribiendo = false;
      if (!err && buffer.length > 0) flushBufferAsync();
    });
  } catch {
    escribiendo = false;
  }
}

tracerEvents.on("span", (spanData) => {
  buffer.push(JSON.stringify(spanData));
  if (buffer.length >= 20) {
    flushBufferAsync();
  } else {
    if (timeoutFlush) clearTimeout(timeoutFlush);
    timeoutFlush = setTimeout(flushBufferAsync, 500);
    timeoutFlush.unref(); // no mantener vivo el event loop
  }
});

// ── 4. Volcado síncrono de emergencia ───────────────────────────────────────
export function flushSyncEmergencia() {
  if (buffer.length === 0) return;
  try {
    const archivo = rutaTraza();
    mkdirSync(dirname(archivo), { recursive: true });
    appendFileSync(archivo, buffer.join("\n") + "\n", "utf8");
    buffer = [];
  } catch {}
}

// 'exit' es seguro: solo corre trabajo síncrono y no puede alterar el código
// de salida del proceso. Se instala siempre.
process.on("exit", flushSyncEmergencia);

/**
 * Red de seguridad OPT-IN para procesos largos (CLIs, daemons).
 *
 * Deliberadamente NO se instala al importar: estos handlers cambian el
 * comportamiento del proceso anfitrión (uncaughtException fuerza exit 1,
 * SIGINT/SIGTERM interceptan la terminación). Un hook fail-open que importe
 * este módulo no puede heredar eso. Ver regla B en el encabezado.
 */
export function instalarRedDeSeguridad() {
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => { flushSyncEmergencia(); process.exit(0); });
  }
  process.on("uncaughtException", (err) => {
    flushSyncEmergencia();
    console.error("\x1b[31mError fatal no capturado (ver .fabrica/traza.jsonl):\x1b[0m", err);
    process.exit(1);
  });
}

// ── 5. Decorador ────────────────────────────────────────────────────────────
export function withTrace(nombre, fn) {
  return async function (...args) {
    const parent = traceContext.getStore();
    const tId = parent ? parent.tId : getId();
    const pId = parent ? parent.sId : null;
    const sId = getId();
    const ts = Date.now();

    return traceContext.run({ tId, sId }, async () => {
      let st = 0;
      const inicio = performance.now();
      try {
        return await fn(...args);
      } catch (err) {
        st = 1;
        throw err;
      } finally {
        const dur = Math.round(performance.now() - inicio);
        tracerEvents.emit("span", { tId, sId, pId, ts, dur, st, n: nombre });
      }
    });
  };
}

// ── 6. Lectura ──────────────────────────────────────────────────────────────
function leerEventos(raiz) {
  const archivo = rutaTraza(raiz);
  if (!existsSync(archivo)) return [];
  return readFileSync(archivo, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/** Resumen de uso: cuántas veces se invocó cada cosa y cuántas fallaron. */
export function resumirUso(raiz) {
  const conteo = new Map();
  for (const e of leerEventos(raiz)) {
    const clave = `${e.ev || "span"}:${e.n || "?"}`;
    const acc = conteo.get(clave) || { ev: e.ev || "span", n: e.n || "?", veces: 0, fallos: 0, durTotal: 0 };
    acc.veces++;
    if (e.st === 1) acc.fallos++;
    if (typeof e.dur === "number") acc.durTotal += e.dur;
    conteo.set(clave, acc);
  }
  return [...conteo.values()].sort((a, b) => b.veces - a.veces);
}

export function verUltimos(n = 20, raiz) {
  const eventos = leerEventos(raiz);
  if (!eventos.length) {
    console.log("No hay traza todavía. Se escribe sola con el uso normal de la fábrica.");
    console.log(`Archivo esperado: ${rutaTraza(raiz)}`);
    return;
  }

  const ultimos = eventos.slice(-n);
  console.log(`\nÚltimos ${ultimos.length} eventos de ${eventos.length} (${rutaTraza(raiz)}):\n`);
  console.log("  hora      tipo        nombre                          dur    estado");
  console.log("  " + "─".repeat(70));
  for (const e of ultimos) {
    const hora = new Date(e.ts).toLocaleTimeString("es-CO", { hour12: false });
    const tipo = (e.ev || "span").padEnd(11).slice(0, 11);
    const nombre = String(e.n || "—").padEnd(31).slice(0, 31);
    const dur = typeof e.dur === "number" ? `${e.dur}ms`.padStart(6) : "     —";
    const estado = e.st === 1 ? "\x1b[31mfalló\x1b[0m" : (e.d ? e.d : "ok");
    console.log(`  ${hora}  ${tipo} ${nombre} ${dur}  ${estado}`);
  }

  const uso = resumirUso(raiz);
  console.log(`\nMás frecuentes:`);
  for (const u of uso.slice(0, 8)) {
    const media = u.durTotal && u.veces ? ` · ${Math.round(u.durTotal / u.veces)}ms de media` : "";
    const fallos = u.fallos ? ` · \x1b[31m${u.fallos} fallo(s)\x1b[0m` : "";
    console.log(`  ${String(u.veces).padStart(4)}×  ${u.ev}:${u.n}${media}${fallos}`);
  }
  console.log("");
}

export function parsearTraza(idBuscado, raiz) {
  const spans = leerEventos(raiz);
  if (!spans.length) { console.error("No existe", rutaTraza(raiz)); return; }

  let objetivo = null;
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].sId === idBuscado || spans[i].tId === idBuscado) { objetivo = spans[i].tId; break; }
  }
  if (!objetivo) { console.error(`No se encontró el trace o span con ID: ${idBuscado}`); return; }

  const delTrace = spans.filter((s) => s.tId === objetivo);
  const mapa = {};
  const raices = [];
  delTrace.forEach((s) => { s.children = []; mapa[s.sId] = s; });
  delTrace.forEach((s) => {
    if (s.pId && mapa[s.pId]) mapa[s.pId].children.push(s);
    else raices.push(s);
  });

  function pintar(nodo, prefijo = "", ultimo = true) {
    const color = nodo.st === 1 ? "\x1b[31m" : (nodo.dur > 1000 ? "\x1b[33m" : "\x1b[37m");
    const icono = nodo.st === 1 ? "🔴" : (nodo.dur > 1000 ? "🟡" : "⚪");
    console.log(`${prefijo}${ultimo ? "└──" : "├──"} [${nodo.dur}ms] ${icono} ${color}${nodo.n}\x1b[0m (span: ${nodo.sId})`);
    const hijoPrefijo = prefijo + (ultimo ? "    " : "│   ");
    nodo.children.forEach((h, i) => pintar(h, hijoPrefijo, i === nodo.children.length - 1));
  }

  console.log(`\n\x1b[36mTraza raíz: ${objetivo}\x1b[0m`);
  raices.forEach((r) => pintar(r, "", true));
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "ver") verUltimos(arg ? Number(arg) : 20);
  else if (cmd === "inspeccionar" && arg) parsearTraza(arg);
  else {
    console.error("Uso:\n  node nucleo/traza.mjs ver [n]\n  node nucleo/traza.mjs inspeccionar <spanId|traceId>");
    process.exit(1);
  }
}
