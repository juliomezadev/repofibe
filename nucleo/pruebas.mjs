#!/usr/bin/env node
// Selección conservadora de pruebas afectadas por cambios Git y el grafo local.

import { execFileSync } from "node:child_process";
import { cargarOGenerar, impactoTransitivo, norm } from "./grafo.mjs";

const RAIZ = process.cwd();
const PATRONES_PREDETERMINADOS = [
  /(^|\/)(tests?|__tests__|spec)\//i,
  /(^|\/)evals\//i,
  /[.\-_](test|spec)\.[a-z]+$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.[a-z]+$/i,
];

function git(args) {
  try {
    return execFileSync("git", ["-C", RAIZ, ...args], {
      encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"],
    }).replace(/\r\n/g, "\n").trim();
  } catch (error) {
    const detalle = String(error.stderr ?? error.message ?? "falló Git").trim();
    const fallo = new Error(detalle || `git ${args[0]} terminó con código ${error.status ?? "desconocido"}`);
    fallo.code = args[0] === "diff" && args.length >= 3 && args[2] !== "--cached" ? "GIT_RANGE_INVALID" : "GIT_COMMAND_FAILED";
    fallo.gitArgs = args;
    throw fallo;
  }
}

const lineas = (texto) => (texto ? texto.split("\n").filter(Boolean) : []);

function archivosCambiados(rango) {
  if (rango) return lineas(git(["diff", "--name-only", rango])).map(norm);
  const staged = lineas(git(["diff", "--name-only", "--cached"]));
  const noStaged = lineas(git(["diff", "--name-only"]));
  const sinTrackear = lineas(git(["ls-files", "--others", "--exclude-standard"]));
  return [...new Set([...staged, ...noStaged, ...sinTrackear].map(norm))];
}

function patronesDesdeArgumentos(args) {
  const patrones = [...PATRONES_PREDETERMINADOS];
  const posicionales = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const argumento = args[i];
    if (argumento === "--json") { json = true; continue; }
    if (argumento === "--patron") {
      const valor = args[++i];
      if (!valor) throw Object.assign(new Error("--patron requiere una expresión regular"), { code: "ARGUMENT_INVALID" });
      try { patrones.push(new RegExp(valor, "i")); }
      catch (error) { throw Object.assign(new Error(`patrón inválido: ${error.message}`), { code: "ARGUMENT_INVALID" }); }
      continue;
    }
    if (argumento.startsWith("--patron=")) {
      const valor = argumento.slice("--patron=".length);
      if (!valor) throw Object.assign(new Error("--patron requiere una expresión regular"), { code: "ARGUMENT_INVALID" });
      try { patrones.push(new RegExp(valor, "i")); }
      catch (error) { throw Object.assign(new Error(`patrón inválido: ${error.message}`), { code: "ARGUMENT_INVALID" }); }
      continue;
    }
    if (argumento.startsWith("-")) throw Object.assign(new Error(`opción desconocida: ${argumento}`), { code: "ARGUMENT_INVALID" });
    posicionales.push(argumento);
  }
  if (posicionales.length > 1) throw Object.assign(new Error("se acepta un solo rango Git"), { code: "ARGUMENT_INVALID" });
  return { json, rango: posicionales[0], patrones };
}

const esArchivoDeTest = (ruta, patrones) => patrones.some((patron) => {
  patron.lastIndex = 0;
  return patron.test(ruta);
});

function calcular(rango, patrones, json) {
  const grafo = cargarOGenerar({
    silencioso: json,
    diagnostico: json ? console.error : console.log,
  });
  const cambiados = archivosCambiados(rango);
  const afectados = new Set();
  for (const cambiado of cambiados) {
    afectados.add(cambiado);
    const { visitado } = impactoTransitivo(grafo.aristas, cambiado);
    for (const archivo of visitado) afectados.add(archivo);
  }
  const pruebas = [...afectados].filter((ruta) => esArchivoDeTest(ruta, patrones)).sort();
  const sinCobertura = cambiados.filter((ruta) => {
    if (esArchivoDeTest(ruta, patrones)) return false;
    const { visitado } = impactoTransitivo(grafo.aristas, ruta);
    return ![...visitado].some((archivo) => esArchivoDeTest(archivo, patrones));
  });
  return { cambiados, pruebas, sinCobertura, grafoGenerado: grafo.generado, grafoCommit: grafo.commit };
}

function main() {
  const [comando, ...args] = process.argv.slice(2);
  if (comando !== "afectadas") {
    console.error("Uso: afectadas [<rango-git>] [--patron <regex>] [--json]");
    process.exitCode = 1;
    return;
  }
  let opciones;
  try {
    opciones = patronesDesdeArgumentos(args);
    const interior = git(["rev-parse", "--is-inside-work-tree"]);
    if (interior !== "true") throw Object.assign(new Error("la ruta no está dentro de un repositorio Git"), { code: "GIT_REPOSITORY_INVALID" });
    const resultado = calcular(opciones.rango, opciones.patrones, opciones.json);
    if (opciones.json) { process.stdout.write(`${JSON.stringify(resultado)}\n`); return; }
    console.log(`Grafo: ${resultado.grafoGenerado?.slice(0, 16) ?? "?"} (commit ${resultado.grafoCommit ?? "—"}). Verifica frescura con: node grafo.mjs frescura`);
    console.log(`Cambiados: ${resultado.cambiados.length}`);
    if (!resultado.cambiados.length) { console.log("Sin cambios detectados."); return; }
    if (resultado.pruebas.length) {
      console.log(`\nPRUEBAS POTENCIALMENTE AFECTADAS (${resultado.pruebas.length}):`);
      for (const prueba of resultado.pruebas) console.log(`  ${prueba}`);
    } else console.log("\nNinguna prueba detectada en el radio de impacto (por nombre/patrón de test).");
    if (resultado.sinCobertura.length) {
      console.log(`\nSIN TEST DETECTADO (${resultado.sinCobertura.length}) — cambiaron y ningún test parece depender de ellos:`);
      for (const cambiado of resultado.sinCobertura) console.log(`  ${cambiado}`);
    }
    console.log("\nEsto es una heurística por imports estáticos, no un oráculo — ante duda real, corre la suite completa.");
  } catch (error) {
    const codigo = error.code === "GIT_RANGE_INVALID" ? "GIT_RANGE_INVALID"
      : error.code === "GIT_COMMAND_FAILED" ? "GIT_REPOSITORY_INVALID"
        : error.code === "ARGUMENT_INVALID" ? error.code
          : "GRAPH_UNTRUSTED";
    if (opciones?.json || args.includes("--json")) process.stdout.write(`${JSON.stringify({ error: { codigo, mensaje: error.message } })}\n`);
    else console.error(`Error (${codigo}): ${error.message}`);
    process.exitCode = 2;
  }
}

main();
