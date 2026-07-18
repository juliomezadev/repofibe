#!/usr/bin/env node
// mapa.mjs — el sentido de orientación de repofibe.
// Genera un mapa estructural del proyecto (.fabrica/mapa.json) para que las
// skills UBIQUEN cosas sin leer el repo entero: directorios con conteos por
// extensión, archivos clave (entradas, configs, docs) y búsqueda por nombre.
// Cero dependencias, rápido (solo lee nombres, jamás contenidos).
//
// Uso:
//   node mapa.mjs generar          # (re)construye .fabrica/mapa.json
//   node mapa.mjs ver              # árbol compacto con conteos
//   node mapa.mjs buscar <término> # archivos cuyo nombre/ruta matchea

import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync } from "node:fs";
import { join, relative, sep, extname, basename } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = process.cwd();
const ARCHIVO = join(RAIZ, ".fabrica", "mapa.json");
const IGNORAR = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", "coverage",
  ".fabrica", "__pycache__", ".venv", "venv", "target", ".gradle", ".idea",
  ".vscode", "vendor", ".cache", "tmp",
]);
const CLAVE = /^(package\.json|readme.*|claude\.md|agents\.md|makefile|dockerfile|.*\.config\.[a-z]+|tsconfig.*|pyproject\.toml|cargo\.toml|go\.mod|index\.[a-z]+|main\.[a-z]+|app\.[a-z]+|diseno\.md|design\.md)$/i;

function caminar(dir, prof) {
  const nodo = { archivos: 0, exts: {}, claves: [], hijos: {} };
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return nodo; }
  for (const e of entradas) {
    if (e.isDirectory()) {
      if (IGNORAR.has(e.name) || e.name.startsWith(".")) continue;
      if (prof < 6) {
        const hijo = caminar(join(dir, e.name), prof + 1);
        if (hijo.archivos > 0 || Object.keys(hijo.hijos).length) nodo.hijos[e.name] = hijo;
      }
    } else {
      nodo.archivos++;
      const ext = (extname(e.name) || "(sin)").toLowerCase();
      nodo.exts[ext] = (nodo.exts[ext] ?? 0) + 1;
      if (CLAVE.test(e.name)) nodo.claves.push(e.name);
    }
  }
  return nodo;
}

function aplanar(nodo, ruta, salida) {
  salida.push({ ruta: ruta || ".", archivos: nodo.archivos, exts: nodo.exts, claves: nodo.claves });
  for (const [nombre, hijo] of Object.entries(nodo.hijos)) aplanar(hijo, ruta ? `${ruta}/${nombre}` : nombre, salida);
  return salida;
}

function listarRutas(nodo, ruta, salida) {
  for (const [nombre, hijo] of Object.entries(nodo.hijos)) listarRutas(hijo, ruta ? `${ruta}/${nombre}` : nombre, salida);
  try {
    const dirAbs = join(RAIZ, ruta);
    for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
      if (e.isFile()) salida.push(ruta ? `${ruta}/${e.name}` : e.name);
    }
  } catch {}
  return salida;
}

function cargar() {
  try { return JSON.parse(readFileSync(ARCHIVO, "utf8")); } catch { return null; }
}

function generar() {
  const arbol = caminar(RAIZ, 0);
  let commit = null;
  try { commit = execFileSync("git", ["-C", RAIZ, "rev-parse", "--short", "HEAD"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const mapa = { generado: new Date().toISOString(), commit, arbol };
  mkdirSync(join(RAIZ, ".fabrica"), { recursive: true });
  const tmp = ARCHIVO + ".tmp";
  writeFileSync(tmp, JSON.stringify(mapa) + "\n", "utf8");
  renameSync(tmp, ARCHIVO);
  const dirs = aplanar(arbol, "", []);
  const total = dirs.reduce((a, d) => a + d.archivos, 0);
  console.log(`Mapa generado: ${dirs.length} directorios, ${total} archivos (commit ${commit ?? "sin git"}).`);
  return mapa;
}

function ver(mapa) {
  if (!mapa) { console.log("Sin mapa. Genera uno: node mapa.mjs generar"); return; }
  console.log(`MAPA (${mapa.generado.slice(0, 16)}, commit ${mapa.commit ?? "—"})`);
  for (const d of aplanar(mapa.arbol, "", [])) {
    const exts = Object.entries(d.exts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e, n]) => `${e}:${n}`).join(" ");
    const claves = d.claves.length ? `  ★ ${d.claves.join(", ")}` : "";
    console.log(`  ${d.ruta}  (${d.archivos} arch${exts ? "; " + exts : ""})${claves}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "generar":
    generar();
    break;
  case "ver":
    ver(cargar());
    break;
  case "buscar": {
    const termino = (args.join(" ") || "").toLowerCase();
    if (!termino) { console.error("Uso: buscar <término>"); process.exit(1); }
    let mapa = cargar();
    if (!mapa) mapa = generar();
    const rutas = listarRutas(mapa.arbol, "", []);
    const hallazgos = rutas
      .map((r) => ({ r, i: r.toLowerCase().indexOf(termino) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => (basename(a.r).toLowerCase().includes(termino) ? 0 : 1) - (basename(b.r).toLowerCase().includes(termino) ? 0 : 1) || a.r.length - b.r.length)
      .slice(0, 20);
    if (!hallazgos.length) { console.log(`Ningún archivo matchea "${termino}" por nombre. Prueba Grep por contenido.`); break; }
    for (const h of hallazgos) console.log(`  ${h.r}`);
    break;
  }
  default:
    console.error("Uso: generar | ver | buscar <término>");
    process.exit(1);
}
