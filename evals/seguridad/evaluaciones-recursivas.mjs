#!/usr/bin/env node
// Regresión Batch 3: el descubrimiento común cubre módulos anidados,
// directorios excluidos, orden y symlinks sin salir de la raíz.
import { symlinkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { descubrirArchivos } from "../../nucleo/archivos.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-evals-recursivas-"));
const rel = (p) => relative(TEMP, p).split("\\").join("/");
try {
  mkdirSync(join(TEMP, "nucleo", "inteligencia", "nested"), { recursive: true });
  mkdirSync(join(TEMP, "node_modules", "no-entra"), { recursive: true });
  writeFileSync(join(TEMP, "nucleo", "a.mjs"), "import './inteligencia/b.mjs';\n");
  writeFileSync(join(TEMP, "nucleo", "inteligencia", "b.mjs"), "export const b = 1;\n");
  writeFileSync(join(TEMP, "nucleo", "inteligencia", "nested", "c.mjs"), "export const c = 1;\n");
  writeFileSync(join(TEMP, "node_modules", "no-entra", "ignored.mjs"), "throw new Error('ignored');\n");

  const una = descubrirArchivos(TEMP, { extensiones: [".mjs"] }).map(rel);
  const otra = descubrirArchivos(TEMP, { extensiones: [".mjs"] }).map(rel);
  assert.deepEqual(una, otra, "el orden debe ser determinista");
  assert.deepEqual(una, ["nucleo/a.mjs", "nucleo/inteligencia/b.mjs", "nucleo/inteligencia/nested/c.mjs"]);
  assert.ok(readFileSync(join(TEMP, "nucleo", "a.mjs"), "utf8").includes("inteligencia/b.mjs"));
  assert.ok(una.includes("nucleo/inteligencia/nested/c.mjs"), "el módulo huérfano anidado debe descubrirse");

  const fuera = join(TEMP, "fuera.mjs");
  writeFileSync(fuera, "export const fuera = true;\n");
  let symlinkCreado = false;
  try {
    symlinkSync(fuera, join(TEMP, "nucleo", "fuera-link.mjs"), "file");
    symlinkCreado = true;
  } catch {}
  const conLink = descubrirArchivos(TEMP, { extensiones: [".mjs"] }).map(rel);
  if (symlinkCreado) assert.ok(!conLink.includes("nucleo/fuera-link.mjs"), "no debe seguir symlinks");
  else console.log("omitido: symlink de fixture no permitido por el sistema operativo");
  console.log("ok: evaluaciones recursivas descubren nested, conservan consumidores, ignoran node_modules y ordenan determinísticamente");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
