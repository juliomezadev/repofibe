#!/usr/bin/env node
// traza.mjs — Telemetría cero-dependencias para repofibe.
// Usa AsyncLocalStorage para propagar contexto de manera invisible.
// I/O asíncrono batcheado con volcado síncrono en caso de crash (Anti-Fugas).

import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";

const ARCHIVO_TRAZA = join(process.cwd(), ".fabrica", "traza.jsonl");

// 1. Contexto Mágico (No Prop Drilling)
export const traceContext = new AsyncLocalStorage();

function getId() {
  return Math.random().toString(36).slice(2, 10);
}

// 2. Desacople y Batching (Alto Rendimiento)
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
    mkdirSync(dirname(ARCHIVO_TRAZA), { recursive: true });
    appendFile(ARCHIVO_TRAZA, volcado, "utf8", (err) => {
      escribiendo = false;
      if (err) console.error("Error volcando traza:", err);
      if (buffer.length > 0) flushBufferAsync();
    });
  } catch (e) {
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
    timeoutFlush.unref(); // No bloquear el event loop al salir
  }
});

// 3. Volcado Síncrono de Emergencia (Máquina Negra)
export function flushSyncEmergencia() {
  if (buffer.length > 0) {
    try {
      mkdirSync(dirname(ARCHIVO_TRAZA), { recursive: true });
      appendFileSync(ARCHIVO_TRAZA, buffer.join("\n") + "\n", "utf8");
      buffer = [];
    } catch (e) {}
  }
}

['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  flushSyncEmergencia();
  process.exit(0);
}));

process.on('exit', () => {
  flushSyncEmergencia();
});

process.on('uncaughtException', (err) => {
  flushSyncEmergencia();
  console.error("\x1b[31mError fatal no capturado (ver traza.jsonl):\x1b[0m", err);
  process.exit(1);
});

// 4. Decorador / Higher-Order Function
export function withTrace(nombre, fn) {
  return async function (...args) {
    const parent = traceContext.getStore();
    const tId = parent ? parent.tId : getId();
    const pId = parent ? parent.sId : null;
    const sId = getId();
    const ts = Date.now();

    const newState = { tId, sId };
    
    return traceContext.run(newState, async () => {
      let st = 0; // 0 = success, 1 = error
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

// 5. CLI: Máquina del Tiempo (Árbol ASCII)
export function parsearTraza(idBuscado) {
  if (!existsSync(ARCHIVO_TRAZA)) {
    console.error("No existe", ARCHIVO_TRAZA);
    return;
  }
  
  const lineas = readFileSync(ARCHIVO_TRAZA, "utf8").split("\n").filter(Boolean);
  
  let targetTraceId = null;
  // Búsqueda invertida (fast retrieval de errores recientes)
  for (let i = lineas.length - 1; i >= 0; i--) {
    try {
      const span = JSON.parse(lineas[i]);
      if (span.sId === idBuscado || span.tId === idBuscado) {
        targetTraceId = span.tId;
        break;
      }
    } catch (e) {}
  }

  if (!targetTraceId) {
    console.error(`No se encontró el trace o span con ID: ${idBuscado}`);
    return;
  }

  const spans = [];
  for (const l of lineas) {
    try {
      const s = JSON.parse(l);
      if (s.tId === targetTraceId) spans.push(s);
    } catch (e) {}
  }

  const map = {};
  const rootSpans = [];
  spans.forEach(s => {
    s.children = [];
    map[s.sId] = s;
  });

  spans.forEach(s => {
    if (s.pId && map[s.pId]) {
      map[s.pId].children.push(s);
    } else {
      rootSpans.push(s);
    }
  });

  function pintar(nodo, prefijo = "", isLast = true) {
    const color = nodo.st === 1 ? "\x1b[31m" : (nodo.dur > 1000 ? "\x1b[33m" : "\x1b[37m");
    const icono = nodo.st === 1 ? "🔴" : (nodo.dur > 1000 ? "🟡" : "⚪");
    const reset = "\x1b[0m";
    const rama = isLast ? "└──" : "├──";
    
    console.log(`${prefijo}${rama} [${nodo.dur}ms] ${icono} ${color}${nodo.n}${reset} (span: ${nodo.sId})`);
    
    const childPrefix = prefijo + (isLast ? "    " : "│   ");
    for (let i = 0; i < nodo.children.length; i++) {
      pintar(nodo.children[i], childPrefix, i === nodo.children.length - 1);
    }
  }

  console.log(`\n\x1b[36mTraza raíz: ${targetTraceId}\x1b[0m`);
  rootSpans.forEach(r => pintar(r, "", true));
}

// Entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "inspeccionar" && args[1]) {
    parsearTraza(args[1]);
  } else {
    console.error("Uso: node nucleo/traza.mjs inspeccionar <spanId | traceId>");
    process.exit(1);
  }
}
