#!/usr/bin/env node
// pruebas.mjs — selección de pruebas afectadas por un cambio.
// Cruza los archivos que cambiaron (git) con el grafo de imports
// (grafo.mjs) para responder: de TODA la suite, ¿cuáles archivos de test
// pueden verse afectados? Sin esto, "corre todo" es la única opción; con
// esto, una suite grande deja de ser un motivo para saltarse los tests.
//
// Heurística, no oráculo: cubre imports estáticos detectables por regex
// (lo mismo que grafo.mjs). Un test que depende de un side-effect no
// importado (env var, archivo leído en runtime) no aparece aquí — por eso
// el veredicto siempre incluye el conteo de "cambiados sin test detectado"
// en vez de prometer cobertura total.
//
// Uso:
//   node pruebas.mjs afectadas                  # cambios sin commitear + staged + untracked
//   node pruebas.mjs afectadas <rango-git>       # p.ej. "main...HEAD"
//   node pruebas.mjs afectadas --json [rango]

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cargarOGenerar, impactoTransitivo, norm } from "./grafo.mjs";

const RAIZ = process.cwd();
const git = (args) => {
  try { return execFileSync("git", ["-C", RAIZ, ...args], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};

const PATRON_TEST = /(^|\/)(tests?|__tests__|spec)\/|[.\-_](test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.[a-z]+$/i;
const esArchivoDeTest = (ruta) => PATRON_TEST.test(ruta);

const lineas = (texto) => (texto ? texto.split("\n").filter(Boolean) : []);

function archivosCambiados(rango) {
  if (rango) return lineas(git(["diff", "--name-only", rango])).map(norm);
  const staged = lineas(git(["diff", "--name-only", "--cached"]));
  const noStaged = lineas(git(["diff", "--name-only"]));
  const sinTrackear = lineas(git(["ls-files", "--others", "--exclude-standard"]));
  return [...new Set([...staged, ...noStaged, ...sinTrackear].map(norm))];
}

function calcular(rango) {
  const grafo = cargarOGenerar();
  const cambiados = archivosCambiados(rango);

  const afectados = new Set();
  for (const c of cambiados) {
    afectados.add(c);
    const { visitado } = impactoTransitivo(grafo.aristas, c);
    for (const v of visitado) afectados.add(v);
  }
  const pruebas = [...afectados].filter(esArchivoDeTest).sort();

  // "sin cobertura": cambió, no es test, y ningún test en su radio de impacto lo alcanza.
  const sinCobertura = cambiados.filter((c) => {
    if (esArchivoDeTest(c)) return false;
    const { visitado } = impactoTransitivo(grafo.aristas, c);
    return ![...visitado].some(esArchivoDeTest);
  });

  return { cambiados, pruebas, sinCobertura, grafoGenerado: grafo.generado, grafoCommit: grafo.commit };
}

const [cmd, ...args] = process.argv.slice(2);
const json = args.includes("--json");
const rango = args.find((a) => a !== "--json");

switch (cmd) {
  case "afectadas": {
    if (!existsSync(RAIZ + "/.git") && !git(["rev-parse", "--is-inside-work-tree"])) {
      console.error("No es un repositorio git — la selección de pruebas necesita git para detectar cambios.");
      process.exit(1);
    }
    const r = calcular(rango);
    if (json) { console.log(JSON.stringify(r, null, 2)); break; }
    console.log(`Grafo: ${r.grafoGenerado?.slice(0, 16) ?? "?"} (commit ${r.grafoCommit ?? "—"}). Verifica frescura con: node grafo.mjs frescura`);
    console.log(`Cambiados: ${r.cambiados.length}`);
    if (!r.cambiados.length) { console.log("Sin cambios detectados."); break; }
    if (r.pruebas.length) {
      console.log(`\nPRUEBAS POTENCIALMENTE AFECTADAS (${r.pruebas.length}):`);
      for (const p of r.pruebas) console.log(`  ${p}`);
    } else {
      console.log("\nNinguna prueba detectada en el radio de impacto (por nombre/patrón de test).");
    }
    if (r.sinCobertura.length) {
      console.log(`\nSIN TEST DETECTADO (${r.sinCobertura.length}) — cambiaron y ningún archivo de test parece depender de ellos, directa o transitivamente:`);
      for (const c of r.sinCobertura) console.log(`  ${c}`);
    }
    console.log("\nEsto es una heurística por imports estáticos, no un oráculo — ante duda real, corre la suite completa.");
    break;
  }
  default:
    console.error("Uso: afectadas [<rango-git>] [--json]");
    process.exit(1);
}
