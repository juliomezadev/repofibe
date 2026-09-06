#!/usr/bin/env node
// Regresión Batch 3: estado persistido distingue ausencia, JSON inválido y
// esquema inválido, sin perder campos desconocidos durante migraciones.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const ESTADO = join(RAIZ, "nucleo", "estado.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-estado-schema-"));
const ejecutar = (...args) => {
  return execFileSync(process.execPath, [ESTADO, ...args], { cwd: TEMP, encoding: "utf8" });
};
const ejecutarSeguro = (...args) => {
  try { return { code: 0, output: ejecutar(...args) }; }
  catch (e) { return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};

try {
  let r = ejecutarSeguro("ver");
  assert.match(r.output, /inexistente/i);

  mkdirSync(join(TEMP, ".fabrica"), { recursive: true });
  const ruta = join(TEMP, ".fabrica", "sprint.json");
  writeFileSync(ruta, "{ roto", "utf8");
  r = ejecutarSeguro("ver");
  assert.notEqual(r.code, 0);
  assert.match(r.output, /JSON inválido/i);

  for (const invalido of [
    {},
    { objetivo: "x", etapa: "pensar", historial: "texto", pendientes: [] },
    { objetivo: "x", etapa: "pensar", historial: [], pendientes: {} },
  ]) {
    writeFileSync(ruta, JSON.stringify(invalido), "utf8");
    r = ejecutarSeguro("ver");
    assert.notEqual(r.code, 0);
    assert.match(r.output, /esquema inválido/i);
  }

  const compatible = { objetivo: "estado compatible", etapa: "pensar", historial: [], pendientes: [] };
  writeFileSync(ruta, JSON.stringify(compatible), "utf8");
  r = ejecutarSeguro("registrar", "eval", "migración compatible");
  assert.equal(r.code, 0);
  let persistido = JSON.parse(readFileSync(ruta, "utf8"));
  assert.equal(persistido.plan, null);
  assert.equal(persistido.version, 1);

  const extra = {
    version: 1,
    objetivo: "estado válido",
    etapa: "construir",
    historial: [{ fecha: "2026-01-01T00:00:00.000Z", skill: "x", resultado: "y" }],
    pendientes: [],
    campoDesconocido: { conservar: true },
  };
  writeFileSync(ruta, JSON.stringify(extra), "utf8");
  r = ejecutarSeguro("registrar", "eval", "campo extra");
  assert.equal(r.code, 0);
  persistido = JSON.parse(readFileSync(ruta, "utf8"));
  assert.deepEqual(persistido.campoDesconocido, extra.campoDesconocido);
  assert.equal(persistido.historial.length, 2);
  console.log("ok: estado inexistente, JSON/schema inválidos, opcionales, migración y campos desconocidos verificados");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
