#!/usr/bin/env node
// orquestador.mjs — CLI demostrable del núcleo de inteligencia.

import { readFileSync } from "node:fs";
import { analizarTarea, validarEstado } from "./inteligencia/index.mjs";

function argumentos(argv) {
  const posicionales = [];
  const opciones = {};
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (actual === "--json") { opciones.json = true; continue; }
    if (actual.startsWith("--") && actual.includes("=")) {
      const [clave, ...resto] = actual.slice(2).split("=");
      opciones[clave] = resto.join("=");
      continue;
    }
    if (actual.startsWith("--")) {
      opciones[actual.slice(2)] = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    posicionales.push(actual);
  }
  return { posicionales, opciones };
}

function imprimir(valor, json) {
  if (json) {
    console.log(JSON.stringify(valor, null, 2));
    return;
  }
  if (valor.tarea && valor.plan) {
    console.log(`TAREA: ${valor.tarea.objetivo}`);
    console.log(`MODO: ${valor.tarea.modo}`);
    console.log(`RUTA: ${valor.ruta.intencion} (${Math.round(valor.ruta.confianza * 100)}% confianza)`);
    console.log(`RIESGO: ${valor.riesgo.nivel} (${valor.riesgo.puntuacion})`);
    console.log(`POLÍTICA: ${valor.politica.motivo}`);
    console.log(`PLAN: ${valor.plan.pasos.length} pasos, ${valor.plan.gates.length} gates`);
    return;
  }
  console.log(JSON.stringify(valor, null, 2));
}

function ayuda() {
  console.log("Uso:");
  console.log('  node nucleo/orquestador.mjs analizar "<objetivo>" [--modo seguro|equilibrado|autonomo] [--json]');
  console.log('  node nucleo/orquestador.mjs plan "<objetivo>" [--modo ...] [--json]');
  console.log('  node nucleo/orquestador.mjs validar <estado.json> [--json]');
  console.log("  node nucleo/orquestador.mjs demo [--json]");
}

const [comando = "ayuda", ...resto] = process.argv.slice(2);
const { posicionales, opciones } = argumentos(resto);

try {
  if (comando === "analizar" || comando === "plan") {
    const objetivo = posicionales.join(" ").trim();
    if (!objetivo) throw new Error("falta el objetivo");
    imprimir(analizarTarea({ objetivo, modo: opciones.modo }), opciones.json === true);
  } else if (comando === "demo") {
    imprimir(analizarTarea({ objetivo: "arreglar el bug de login y ejecutar pruebas", modo: "equilibrado" }), opciones.json === true);
  } else if (comando === "validar") {
    const ruta = posicionales[0];
    if (!ruta) throw new Error("falta la ruta del archivo JSON");
    const entrada = JSON.parse(readFileSync(ruta, "utf8"));
    const resultado = validarEstado(entrada);
    imprimir(resultado, opciones.json === true);
    if (!resultado.valido) process.exitCode = 1;
  } else {
    ayuda();
    if (comando !== "ayuda") process.exitCode = 1;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}

