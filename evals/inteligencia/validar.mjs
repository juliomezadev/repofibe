#!/usr/bin/env node
// Eval tier 1 del núcleo de inteligencia. Solo usa Node y archivos temporales.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  crearEvidencia,
  crearPlan,
  crearTarea,
  validarEvidencia,
  validarPlan,
  validarTarea,
} from "../../nucleo/inteligencia/contratos.mjs";
import { clasificarRiesgo } from "../../nucleo/inteligencia/riesgo.mjs";
import {
  MODOS,
  normalizarModo,
  resolverPolitica,
} from "../../nucleo/inteligencia/modos.mjs";
import { enrutar } from "../../nucleo/inteligencia/router.mjs";
import {
  validarEstado,
  validarTransicionEstado,
} from "../../nucleo/inteligencia/evidencia.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(RAIZ, "nucleo", "orquestador.mjs");
let pasadas = 0;

function ok(nombre, prueba) {
  try {
    prueba();
    pasadas += 1;
    console.log(`  ok: ${nombre}`);
  } catch (error) {
    console.error(`  FAIL: ${nombre}`);
    throw error;
  }
}

ok("contratos crean tarea, plan y evidencia serializables", () => {
  const tarea = crearTarea({
    id: "t-inteligencia",
    objetivo: "Corregir el error de autenticación sin tocar producción",
    modo: "autónomo",
    alcance: ["src/auth"],
  });
  assert.equal(tarea.version, 1);
  assert.equal(tarea.modo, MODOS.AUTONOMO);
  assert.deepEqual(tarea.alcance, ["src/auth"]);
  assert.doesNotThrow(() => JSON.stringify(tarea));

  const plan = crearPlan({
    tarea,
    intencion: "debug",
    riesgo: { nivel: "medio", puntuacion: 2, señales: [] },
    modo: tarea.modo,
    pasos: ["Reproducir el fallo", "Ejecutar las pruebas"],
    gates: [{ id: "tests", tipo: "prueba", descripcion: "Pruebas verdes" }],
  });
  assert.equal(plan.tareaId, tarea.id);
  assert.equal(plan.estado, "propuesto");
  assert.equal(plan.pasos.length, 2);
  assert.equal(plan.gates[0].requerido, true);

  const evidencia = crearEvidencia({
    gateId: "tests",
    tipo: "prueba",
    fuente: "node evals/inteligencia/validar.mjs",
    exito: true,
    exitCode: 0,
  });
  assert.equal(validarEvidencia(evidencia).valido, true);
});

ok("contratos rechazan campos obligatorios inválidos", () => {
  assert.throws(() => crearTarea({ objetivo: "" }), /objetivo/);
  assert.throws(() => crearTarea({ objetivo: "x", modo: "magico" }), /modo/);
  assert.equal(validarTarea({}).valido, false);
  assert.equal(validarPlan({}).valido, false);
  assert.equal(validarEvidencia({}).valido, false);
});

ok("clasifica riesgo bajo, medio y alto con señales explicables", () => {
  const bajo = clasificarRiesgo({ objetivo: "Inspeccionar la configuración del proyecto" });
  const medio = clasificarRiesgo({ objetivo: "Modificar el componente de login y ejecutar tests" });
  const alto = clasificarRiesgo({ objetivo: "Eliminar datos de producción y hacer deploy" });
  assert.equal(bajo.nivel, "bajo");
  assert.equal(medio.nivel, "medio");
  assert.equal(alto.nivel, "alto");
  assert.ok(alto.señales.length >= 2);
  assert.ok(alto.requiereAprobacion);
});

ok("normaliza modos y aplica políticas de aprobación", () => {
  assert.equal(normalizarModo("autónomo"), MODOS.AUTONOMO);
  assert.equal(normalizarModo("equilibrado"), MODOS.EQUILIBRADO);
  assert.equal(resolverPolitica({ modo: "seguro", accion: "escritura", nivelRiesgo: "bajo" }).requiereAprobacion, true);
  assert.equal(resolverPolitica({ modo: "equilibrado", accion: "lectura", nivelRiesgo: "alto" }).requiereAprobacion, true);
  assert.equal(resolverPolitica({ modo: "autonomo", accion: "escritura", nivelRiesgo: "medio" }).requiereAprobacion, false);
  assert.equal(resolverPolitica({ modo: "autonomo", accion: "destructiva", nivelRiesgo: "alto" }).requiereAprobacion, true);
});

ok("enruta por intención explícita y por lenguaje natural", () => {
  assert.equal(enrutar({ objetivo: "arreglar el bug de login" }).intencion, "debug");
  assert.equal(enrutar({ objetivo: "auditar vulnerabilidades y secretos" }).intencion, "seguridad");
  assert.equal(enrutar({ objetivo: "revisar la política de privacidad" }).intencion, "legal");
  assert.equal(enrutar({ objetivo: "cualquier cosa", contexto: { intencion: "qa" } }).intencion, "qa");
  assert.ok(enrutar({ objetivo: "arreglar el bug" }).confianza > 0.5);
});

ok("valida estado incompleto sin permitir falso completado", () => {
  const tarea = crearTarea({ id: "t-estado", objetivo: "Eliminar datos de producción", modo: "seguro" });
  const riesgo = clasificarRiesgo(tarea);
  const plan = crearPlan({
    tarea,
    intencion: "release",
    riesgo,
    modo: tarea.modo,
    pasos: [{ id: "p1", descripcion: "Revisar el impacto" }],
    gates: [
      { id: "tests", tipo: "prueba", descripcion: "Prueba de regresión" },
      { id: "approval", tipo: "aprobacion", descripcion: "Aprobación explícita" },
    ],
  });
  plan.estado = "completado";
  const resultado = validarEstado({ tarea, plan, evidencias: [] });
  assert.equal(resultado.valido, false);
  assert.equal(resultado.completo, false);
  assert.ok(resultado.faltantes.some((item) => item.includes("tests")));
  assert.ok(resultado.faltantes.some((item) => item.includes("approval")));
});

ok("acepta completado solo con pasos y gates respaldados", () => {
  const tarea = crearTarea({ id: "t-completo", objetivo: "Corregir un bug menor", modo: "equilibrado" });
  const riesgo = clasificarRiesgo(tarea);
  const plan = crearPlan({
    tarea,
    intencion: "debug",
    riesgo,
    modo: tarea.modo,
    pasos: [{ id: "p1", descripcion: "Aplicar y verificar la corrección", estado: "completado" }],
    gates: [{ id: "tests", tipo: "prueba", descripcion: "Prueba de regresión" }],
  });
  plan.estado = "completado";
  const evidencia = crearEvidencia({
    id: "ev-tests",
    gateId: "tests",
    tipo: "prueba",
    fuente: "node --test",
    exito: true,
    exitCode: 0,
  });
  const resultado = validarEstado({ tarea, plan, evidencias: [evidencia] });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.completo, true);
  assert.equal(resultado.coberturaGates, 1);
});

ok("valida transiciones de estado y bloquea saltos inválidos", () => {
  assert.equal(validarTransicionEstado("propuesto", "en_curso").valido, true);
  assert.equal(validarTransicionEstado("en_curso", "completado").valido, true);
  assert.equal(validarTransicionEstado("propuesto", "completado").valido, false);
  assert.equal(validarTransicionEstado("cancelado", "en_curso").valido, false);
});

ok("CLI analiza una tarea y devuelve contrato JSON", () => {
  const resultado = spawnSync(process.execPath, [CLI, "analizar", "arreglar el bug de login", "--modo", "equilibrado", "--json"], { encoding: "utf8" });
  assert.equal(resultado.status, 0, resultado.stderr);
  const salida = JSON.parse(resultado.stdout);
  assert.equal(salida.tarea.modo, "equilibrado");
  assert.equal(salida.ruta.intencion, "debug");
  assert.equal(salida.riesgo.nivel, "medio");
  assert.ok(Array.isArray(salida.plan.pasos));
});

ok("CLI valida un archivo de estado y usa código de salida", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "repofibe-inteligencia-"));
  try {
    const entrada = join(carpeta, "estado.json");
    const tarea = crearTarea({ id: "t-cli", objetivo: "Inspeccionar logs", modo: "seguro" });
    const riesgo = clasificarRiesgo(tarea);
    const plan = crearPlan({ tarea, intencion: "general", riesgo, modo: tarea.modo, pasos: [] });
    writeFileSync(entrada, JSON.stringify({ tarea, plan, evidencias: [] }), "utf8");
    const resultado = spawnSync(process.execPath, [CLI, "validar", entrada, "--json"], { encoding: "utf8" });
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(JSON.parse(resultado.stdout).valido, true);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

console.log(`\nInteligencia: ${pasadas} pruebas pasaron.`);
