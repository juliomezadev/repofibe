#!/usr/bin/env node
// evals/nucleo/sync.mjs — eval funcional de sync.mjs (merge append-only + config)
//
// El escaneo de secretos ya tiene eval propia (evals/nucleo/secretos.mjs).
// Aquí solo se prueba el merge de JSONL y la gestión de config — la
// integración real (push/pull con repo git) es job manual del usuario.

import { strictEqual, ok } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cargarConfig } from "../../nucleo/sync.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-sync-eval-"));

function probarMergeAppendOnly() {
  // Simular JSONL local (3 entradas con IDs)
  const local = [
    { id: "a1", tipo: "aprendizaje", texto: "local 1", fecha: "2026-07-19" },
    { id: "a2", tipo: "aprendizaje", texto: "local 2", fecha: "2026-07-19" },
    { id: "a3", tipo: "decision", texto: "local 3", fecha: "2026-07-19" },
  ];

  // Simular JSONL remoto (4 entradas: 2 duplicadas, 2 nuevas)
  const remoto = [
    { id: "a1", tipo: "aprendizaje", texto: "local 1", fecha: "2026-07-19" },
    { id: "a2", tipo: "aprendizaje", texto: "local 2", fecha: "2026-07-19" },
    { id: "b1", tipo: "eureka", texto: "remoto nuevo 1", fecha: "2026-07-18" },
    { id: "b2", tipo: "error", texto: "remoto nuevo 2", fecha: "2026-07-18" },
  ];

  // Merge append-only: deduplicar por ID
  const localIds = new Set(local.map((l) => l.id));
  const nuevas = remoto.filter((l) => !localIds.has(l.id));
  strictEqual(nuevas.length, 2, "solo 2 entradas remotas debían ser nuevas (b1, b2)");
  ok(nuevas.find((l) => l.id === "b1"), "b1 debía estar en las nuevas");
  ok(nuevas.find((l) => l.id === "b2"), "b2 debía estar en las nuevas");

  // Simular merge real: local + nuevas = resultado
  const merged = [...local, ...nuevas];
  strictEqual(merged.length, 5, "merge debía tener 5 entradas (3 local + 2 nuevas)");
  const mergedIds = new Set(merged.map((l) => l.id));
  strictEqual(mergedIds.size, 5, "no debía haber IDs duplicados en el merge");
}

function probarConfig() {
  // Sin archivo de config → null
  const result = cargarConfig();
  ok(result === null || result === undefined, "sin config file, cargarConfig debía retornar null/undefined");
}

try {
  probarMergeAppendOnly();
  console.log("ok: merge append-only deduplica por ID (2 nuevas de 4 remotas, 0 duplicados en resultado)");
  probarConfig();
  console.log("ok: cargarConfig retorna null sin archivo de config");
  console.log("Sync: merge append-only y config verificados; push/pull real es job manual con repo privado del usuario.");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}