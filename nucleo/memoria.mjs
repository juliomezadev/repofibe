#!/usr/bin/env node
// memoria.mjs — memoria persistente de repofibe.
// Dos capas: por proyecto (.fabrica/memoria.jsonl) y global (~/.repofibe/memoria.jsonl).
// Cero dependencias, JSONL append-only: legible, versionable, imposible de corromper entero.
//
// Uso:
//   node memoria.mjs agregar <aprendizaje|decision|gusto|error|eureka> "<texto>" [--global]
//   node memoria.mjs buscar "<términos>" [max]
//   node memoria.mjs listar [max] [--global]

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const TIPOS = ["aprendizaje", "decision", "gusto", "error", "eureka"];
const LOCAL = join(process.cwd(), ".fabrica", "memoria.jsonl");
const GLOBAL = join(homedir(), ".repofibe", "memoria.jsonl");

function leer(ruta) {
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Normaliza para búsqueda insensible a mayúsculas y acentos.
function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function mostrar(e, origen) {
  console.log(`[${e.fecha.slice(0, 10)}] (${e.tipo}${origen ? ", " + origen : ""}) ${e.texto}`);
}

const [cmd, ...args] = process.argv.slice(2);
const esGlobal = args.includes("--global");
const limpios = args.filter((a) => a !== "--global");

switch (cmd) {
  case "agregar": {
    const [tipo, ...resto] = limpios;
    const texto = resto.join(" ").trim();
    if (!TIPOS.includes(tipo) || !texto) {
      console.error(`Uso: agregar <${TIPOS.join("|")}> "<texto>" [--global]`);
      process.exit(1);
    }
    const ruta = esGlobal ? GLOBAL : LOCAL;
    mkdirSync(dirname(ruta), { recursive: true });
    const entrada = { fecha: new Date().toISOString(), tipo, texto };
    appendFileSync(ruta, JSON.stringify(entrada) + "\n", "utf8");
    console.log(`Memoria guardada (${esGlobal ? "global" : "proyecto"}): ${texto}`);
    break;
  }

  case "buscar": {
    const terminos = normalizar(limpios[0] ?? "").split(/\s+/).filter(Boolean);
    const max = parseInt(limpios[1], 10) || 8;
    if (!terminos.length) { console.error("Uso: buscar \"<términos>\" [max]"); process.exit(1); }
    const todo = [
      ...leer(LOCAL).map((e) => ({ ...e, origen: "proyecto" })),
      ...leer(GLOBAL).map((e) => ({ ...e, origen: "global" })),
    ];
    const puntuados = todo
      .map((e) => {
        const t = normalizar(e.texto);
        const puntos = terminos.reduce((acc, term) => acc + (t.includes(term) ? 1 : 0), 0);
        return { e, puntos };
      })
      .filter((x) => x.puntos > 0)
      .sort((a, b) => b.puntos - a.puntos || (a.e.fecha < b.e.fecha ? 1 : -1))
      .slice(0, max);
    if (!puntuados.length) { console.log("Sin resultados en memoria."); break; }
    for (const { e } of puntuados) mostrar(e, e.origen);
    break;
  }

  case "listar": {
    const max = parseInt(limpios[0], 10) || 20;
    const entradas = leer(esGlobal ? GLOBAL : LOCAL).slice(-max);
    if (!entradas.length) { console.log("Memoria vacía."); break; }
    for (const e of entradas) mostrar(e);
    break;
  }

  default:
    console.error("Comando desconocido. Usa: agregar | buscar | listar");
    process.exit(1);
}
