#!/usr/bin/env node
// dominio.mjs — domain-skills: notas persistentes por sitio web.
//
// Cuando /scrape o /qa descubren algo reutilizable de un dominio ("el
// precio vive en la clase .price", "el login usa un iframe"), guardarlo
// aquí evita re-descubrirlo cada vez. Ciclo de confianza: toda nota nace
// en CUARENTENA (se muestra, pero marcada como no verificada) y pasa a
// ACTIVA solo tras 3 usos exitosos registrados — igual que el modelo de
// gstack, más simple. Una nota que falla se puede retirar.
//
// Almacenamiento: JSONL append-only en .fabrica/dominio-notas.jsonl
// (mismo patrón que memoria.mjs) — legible, versionable, nunca corrupto
// a medias.
//
// Uso:
//   node dominio.mjs agregar <dominio> "<nota>"
//   node dominio.mjs listar <dominio>
//   node dominio.mjs usar <dominio> <id>          # +1 uso exitoso, promueve a los 3
//   node dominio.mjs retirar <dominio> <id>

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const RAIZ = process.cwd();
const ARCHIVO = join(RAIZ, ".fabrica", "dominio-notas.jsonl");
const UMBRAL_ACTIVA = 3;

function normalizarDominio(d) {
  try { return new URL(d.includes("://") ? d : `https://${d}`).hostname.toLowerCase(); }
  catch { return String(d).toLowerCase(); }
}

function cargarTodas() {
  if (!existsSync(ARCHIVO)) return [];
  return readFileSync(ARCHIVO, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function guardarTodas(notas) {
  mkdirSync(dirname(ARCHIVO), { recursive: true });
  writeFileSync(ARCHIVO, notas.map((n) => JSON.stringify(n)).join("\n") + (notas.length ? "\n" : ""), "utf8");
}

export function agregar(dominio, texto) {
  const notas = cargarTodas();
  const nota = {
    id: randomBytes(4).toString("hex"),
    dominio: normalizarDominio(dominio),
    texto,
    usos: 0,
    estado: "cuarentena",
    creado: new Date().toISOString(),
  };
  notas.push(nota);
  guardarTodas(notas);
  return nota;
}

export function listar(dominio) {
  const d = normalizarDominio(dominio);
  return cargarTodas().filter((n) => n.dominio === d && n.estado !== "retirada");
}

export function usar(dominio, id) {
  const notas = cargarTodas();
  const d = normalizarDominio(dominio);
  const nota = notas.find((n) => n.dominio === d && n.id === id);
  if (!nota) return null;
  nota.usos++;
  if (nota.usos >= UMBRAL_ACTIVA && nota.estado === "cuarentena") nota.estado = "activa";
  guardarTodas(notas);
  return nota;
}

export function retirar(dominio, id) {
  const notas = cargarTodas();
  const d = normalizarDominio(dominio);
  const nota = notas.find((n) => n.dominio === d && n.id === id);
  if (!nota) return null;
  nota.estado = "retirada";
  guardarTodas(notas);
  return nota;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "agregar": {
      const [dominio, ...resto] = args;
      const texto = resto.join(" ").trim();
      if (!dominio || !texto) { console.error('Uso: agregar <dominio> "<nota>"'); process.exit(1); }
      const n = agregar(dominio, texto);
      console.log(`Nota ${n.id} guardada para ${n.dominio} (cuarentena, 0/${UMBRAL_ACTIVA} usos).`);
      break;
    }
    case "listar": {
      const [dominio] = args;
      if (!dominio) { console.error("Uso: listar <dominio>"); process.exit(1); }
      const notas = listar(dominio);
      if (!notas.length) { console.log(`Sin notas para ${normalizarDominio(dominio)}.`); break; }
      for (const n of notas) console.log(`  [${n.id}] (${n.estado}, ${n.usos}/${UMBRAL_ACTIVA}) ${n.texto}`);
      break;
    }
    case "usar": {
      const [dominio, id] = args;
      if (!dominio || !id) { console.error("Uso: usar <dominio> <id>"); process.exit(1); }
      const n = usar(dominio, id);
      if (!n) { console.error("Nota no encontrada."); process.exit(1); }
      console.log(`Nota ${n.id}: ${n.usos}/${UMBRAL_ACTIVA} usos, estado: ${n.estado}${n.estado === "activa" && n.usos === UMBRAL_ACTIVA ? " (promovida)" : ""}.`);
      break;
    }
    case "retirar": {
      const [dominio, id] = args;
      if (!dominio || !id) { console.error("Uso: retirar <dominio> <id>"); process.exit(1); }
      const n = retirar(dominio, id);
      if (!n) { console.error("Nota no encontrada."); process.exit(1); }
      console.log(`Nota ${n.id} retirada.`);
      break;
    }
    default:
      console.error("Uso: agregar <dominio> <nota> | listar <dominio> | usar <dominio> <id> | retirar <dominio> <id>");
      process.exit(1);
  }
}
