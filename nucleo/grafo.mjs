#!/usr/bin/env node
// grafo.mjs — el grafo de código de repofibe: nodos y relaciones para que el
// agente sepa qué depende de qué SIN leer archivos (consultas puntuales, no
// lecturas masivas — cada consulta cuesta ~20 líneas de contexto, no 20 archivos).
//
// Grafo propio: imports entre archivos del proyecto (JS/TS/Python, regex, <2s,
// siempre fresco). Grafo externo: consume graph.json formato NetworkX (p.ej.
// graphify) con chequeo de frescura obligatorio — un grafo viejo miente.
//
// Uso:
//   node grafo.mjs generar                  # escanea imports → .fabrica/grafo.json
//   node grafo.mjs deps <archivo>           # de qué depende (directo)
//   node grafo.mjs impacto <archivo>        # quién se rompe si lo toco (inverso, transitivo, prof ≤4)
//   node grafo.mjs hubs [n]                 # archivos más conectados (críticos)
//   node grafo.mjs frescura                 # ¿el grafo sigue siendo confiable?
//   node grafo.mjs externo <dir> resumen    # resumen de un graph.json externo (NetworkX)
//   node grafo.mjs externo <dir> frescura   # manifest.json vs disco

import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = process.cwd();
const ARCHIVO = join(RAIZ, ".fabrica", "grafo.json");
const IGNORAR = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage", ".fabrica", "__pycache__", ".venv", "venv", "target", "vendor", ".cache"]);
const EXTS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py"]);

const norm = (p) => p.split("\\").join("/");

function archivosCodigo(dir, base, salida) {
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return salida; }
  for (const e of entradas) {
    if (e.isDirectory()) {
      if (!IGNORAR.has(e.name) && !e.name.startsWith(".")) archivosCodigo(join(dir, e.name), base, salida);
    } else if (EXTS.has(extname(e.name).toLowerCase())) {
      salida.push(norm(relative(base, join(dir, e.name))));
    }
  }
  return salida;
}

// Extrae especificadores de import/require de un archivo (regex, aproximado).
function extraerImports(texto, esPython) {
  const encontrados = [];
  if (esPython) {
    for (const m of texto.matchAll(/^\s*from\s+([.\w]+)\s+import\b/gm)) encontrados.push(m[1]);
    for (const m of texto.matchAll(/^\s*import\s+([.\w]+)/gm)) encontrados.push(m[1]);
  } else {
    for (const m of texto.matchAll(/(?:import|export)[^'"`;]*?from\s*['"`]([^'"`]+)['"`]/g)) encontrados.push(m[1]);
    for (const m of texto.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) encontrados.push(m[1]);
    for (const m of texto.matchAll(/\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) encontrados.push(m[1]);
    for (const m of texto.matchAll(/^\s*import\s+['"`]([^'"`]+)['"`]/gm)) encontrados.push(m[1]);
  }
  return encontrados;
}

// Resuelve un especificador relativo a un archivo real del proyecto.
function resolver(espec, desde, conjunto) {
  if (espec.startsWith(".")) {
    const base = norm(join(dirname(desde), espec));
    const candidatos = [base, ...[".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py"].map((e) => base + e),
      ...["index.js", "index.ts", "index.mjs", "index.jsx", "index.tsx", "__init__.py"].map((i) => base + "/" + i)];
    return candidatos.find((c) => conjunto.has(c)) ?? null;
  }
  // Python: from paquete.modulo import → paquete/modulo.py
  if (/^[\w.]+$/.test(espec) && desde.endsWith(".py")) {
    const ruta = espec.replace(/^\.+/, "").split(".").join("/");
    const candidatos = [ruta + ".py", ruta + "/__init__.py"];
    return candidatos.find((c) => conjunto.has(c)) ?? null;
  }
  return null; // paquete externo
}

function generar() {
  const archivos = archivosCodigo(RAIZ, RAIZ, []);
  const conjunto = new Set(archivos);
  const aristas = {}; const externos = {};
  for (const a of archivos) {
    let texto;
    try { texto = readFileSync(join(RAIZ, a), "utf8"); } catch { continue; }
    const deps = new Set(); const ext = new Set();
    for (const espec of extraerImports(texto, a.endsWith(".py"))) {
      const r = resolver(espec, a, conjunto);
      if (r && r !== a) deps.add(r);
      else if (!r && !espec.startsWith(".")) ext.add(espec.split("/")[0]);
    }
    if (deps.size) aristas[a] = [...deps];
    if (ext.size) externos[a] = [...ext];
  }
  let commit = null;
  try { commit = execFileSync("git", ["-C", RAIZ, "rev-parse", "--short", "HEAD"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const grafo = { generado: new Date().toISOString(), commit, archivos: archivos.length, aristas, externos };
  mkdirSync(join(RAIZ, ".fabrica"), { recursive: true });
  const tmp = ARCHIVO + ".tmp";
  writeFileSync(tmp, JSON.stringify(grafo) + "\n", "utf8");
  renameSync(tmp, ARCHIVO);
  const nAristas = Object.values(aristas).reduce((s, d) => s + d.length, 0);
  console.log(`Grafo generado: ${archivos.length} archivos, ${nAristas} dependencias internas (commit ${commit ?? "sin git"}).`);
  return grafo;
}

function cargar() {
  try { return JSON.parse(readFileSync(ARCHIVO, "utf8")); } catch { return null; }
}

function cargarOGenerar() {
  const g = cargar();
  if (g) return g;
  console.log("(sin grafo previo — generando)");
  return generar();
}

function inverso(aristas) {
  const inv = {};
  for (const [de, deps] of Object.entries(aristas)) for (const d of deps) (inv[d] ??= []).push(de);
  return inv;
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "generar": generar(); break;

  case "deps": {
    const g = cargarOGenerar();
    const a = norm(args[0] ?? "");
    const deps = g.aristas[a] ?? [];
    const ext = g.externos[a] ?? [];
    if (!deps.length && !ext.length) { console.log(`${a}: sin dependencias detectadas (¿ruta correcta? usa mapa.mjs buscar)`); break; }
    if (deps.length) { console.log(`${a} depende de (interno):`); for (const d of deps) console.log(`  ${d}`); }
    if (ext.length) console.log(`externos: ${ext.join(", ")}`);
    break;
  }

  case "impacto": {
    const g = cargarOGenerar();
    const a = norm(args[0] ?? "");
    const inv = inverso(g.aristas);
    const visitado = new Set([a]); let frontera = [a]; const niveles = [];
    for (let prof = 1; prof <= 4 && frontera.length; prof++) {
      const siguiente = [];
      for (const f of frontera) for (const dep of inv[f] ?? []) if (!visitado.has(dep)) { visitado.add(dep); siguiente.push(dep); }
      if (siguiente.length) niveles.push({ prof, archivos: siguiente });
      frontera = siguiente;
    }
    if (!niveles.length) { console.log(`${a}: nadie depende de él (hoja) — impacto local. Verifica igual con Grep si es API pública.`); break; }
    console.log(`IMPACTO de tocar ${a} (${visitado.size - 1} archivos):`);
    for (const n of niveles) { console.log(` prof ${n.prof}:`); for (const f of n.archivos.slice(0, 15)) console.log(`  ${f}`); if (n.archivos.length > 15) console.log(`  ... y ${n.archivos.length - 15} más`); }
    break;
  }

  case "hubs": {
    const g = cargarOGenerar();
    const n = parseInt(args[0], 10) || 10;
    const grado = {};
    for (const [de, deps] of Object.entries(g.aristas)) {
      grado[de] = (grado[de] ?? 0) + deps.length;
      for (const d of deps) grado[d] = (grado[d] ?? 0) + 1;
    }
    const top = Object.entries(grado).sort((a, b) => b[1] - a[1]).slice(0, n);
    if (!top.length) { console.log("Sin conexiones internas detectadas."); break; }
    console.log(`HUBS (los ${top.length} archivos más conectados — tocarlos tiene el mayor radio):`);
    for (const [f, gr] of top) console.log(`  ${String(gr).padStart(3)}  ${f}`);
    break;
  }

  case "frescura": {
    const g = cargar();
    if (!g) { console.log("Sin grafo. Genera: node grafo.mjs generar"); break; }
    const desde = new Date(g.generado).getTime();
    const actuales = archivosCodigo(RAIZ, RAIZ, []);
    let cambiados = 0;
    for (const a of actuales) { try { if (statSync(join(RAIZ, a)).mtimeMs > desde) cambiados++; } catch {} }
    const nuevos = actuales.length - g.archivos;
    const pct = g.archivos ? Math.round((cambiados / g.archivos) * 100) : 0;
    console.log(`Grafo de ${g.generado.slice(0, 16)} (commit ${g.commit ?? "—"}): ${cambiados} modificados desde entonces (${pct}%), ${nuevos >= 0 ? "+" + nuevos : nuevos} archivos.`);
    console.log(pct > 10 || Math.abs(nuevos) > 3 ? "VEREDICTO: NO CONFIABLE — regenera con: node grafo.mjs generar" : "VEREDICTO: confiable.");
    break;
  }

  case "externo": {
    const dir = args[0]; const sub = args[1] ?? "resumen";
    if (!dir || !existsSync(join(dir, "graph.json"))) { console.error("Uso: externo <dir-con-graph.json> [resumen|frescura]"); process.exit(1); }
    if (sub === "frescura") {
      let manifest;
      try { manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")); } catch { console.log("Sin manifest.json — imposible verificar frescura: trata el grafo como NO CONFIABLE."); break; }
      let cambiados = 0, desaparecidos = 0; const total = Object.keys(manifest).length;
      for (const [ruta, meta] of Object.entries(manifest)) {
        try { if (statSync(ruta).mtimeMs / 1000 > (meta.mtime ?? 0) + 1) cambiados++; } catch { desaparecidos++; }
      }
      const pct = total ? Math.round(((cambiados + desaparecidos) / total) * 100) : 100;
      console.log(`Grafo externo: ${total} archivos en manifest; ${cambiados} modificados, ${desaparecidos} ya no existen (${pct}% desviado).`);
      console.log(pct > 10 ? "VEREDICTO: NO CONFIABLE — regenera el grafo con su herramienta antes de usarlo." : "VEREDICTO: confiable.");
    } else {
      const g = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8"));
      const nodos = g.nodes?.length ?? 0; const aristas = g.links?.length ?? g.edges?.length ?? 0;
      const grado = {};
      for (const l of g.links ?? g.edges ?? []) { grado[l.source] = (grado[l.source] ?? 0) + 1; grado[l.target] = (grado[l.target] ?? 0) + 1; }
      const top = Object.entries(grado).sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log(`Grafo externo (NetworkX): ${nodos} nodos, ${aristas} aristas (ratio ${(aristas / Math.max(nodos, 1)).toFixed(2)} — <1.2 ≈ árbol de contención, poca señal de llamadas).`);
      if (top.length) { console.log("HUBS externos:"); for (const [id, gr] of top) console.log(`  ${String(gr).padStart(4)}  ${id}`); }
      console.log("Recuerda: verifica frescura antes de confiar → externo <dir> frescura");
    }
    break;
  }

  default:
    console.error("Uso: generar | deps <archivo> | impacto <archivo> | hubs [n] | frescura | externo <dir> [resumen|frescura]");
    process.exit(1);
}
