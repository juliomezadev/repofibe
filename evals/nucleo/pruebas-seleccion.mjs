#!/usr/bin/env node
// Regresiones F13: los resultados Git no se pueden confundir con un diff vacío.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const CLI = join(RAIZ, "nucleo", "pruebas.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-pruebas-seleccion-"));
const git = (args, cwd = TEMP) => execFileSync("git", args, { cwd, stdio: "ignore" });
const correr = (args = [], cwd = TEMP) => spawnSync(process.execPath, [CLI, "afectadas", "--json", ...args], { cwd, encoding: "utf8" });

try {
  git(["init", "-q"]);
  git(["config", "user.name", "eval"]);
  git(["config", "user.email", "eval@repofibe.local"]);
  mkdirSync(join(TEMP, "src"), { recursive: true });
  mkdirSync(join(TEMP, "evals"), { recursive: true });
  mkdirSync(join(TEMP, "custom"), { recursive: true });
  writeFileSync(join(TEMP, ".gitignore"), ".fabrica/\n");
  writeFileSync(join(TEMP, "src", "feature.mjs"), "export const value = 1;\n");
  writeFileSync(join(TEMP, "evals", "feature.mjs"), "import { value } from '../src/feature.mjs';\nexport const check = value;\n");
  writeFileSync(join(TEMP, "custom", "check.js"), "import { value } from '../src/feature.mjs';\nexport const check = value;\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "base"]);

  const vacio = correr();
  assert.equal(vacio.status, 0, vacio.stderr);
  assert.doesNotThrow(() => JSON.parse(vacio.stdout), "--json solo debe escribir un documento JSON en stdout");
  assert.deepEqual(JSON.parse(vacio.stdout).cambiados, [], "un diff válido y vacío se distingue de un error");

  writeFileSync(join(TEMP, "src", "feature.mjs"), "export const value = 2;\n");
  const afectadas = correr();
  assert.equal(afectadas.status, 0, afectadas.stderr);
  assert.ok(JSON.parse(afectadas.stdout).pruebas.includes("evals/feature.mjs"), "evals/ cuenta como test afectado");
  assert.ok(!JSON.parse(afectadas.stdout).pruebas.includes("custom/check.js"), "el patrón extra se aplica explícitamente");
  const patron = correr(["--patron", "^custom/.*\\.js$"]);
  assert.equal(patron.status, 0, patron.stderr);
  assert.ok(JSON.parse(patron.stdout).pruebas.includes("custom/check.js"), "--patron amplía los patrones conocidos");

  const rangoInvalido = correr(["no-existe...tampoco-existe"]);
  assert.notEqual(rangoInvalido.status, 0, "un rango Git inválido falla en vez de parecer un diff vacío");
  assert.doesNotThrow(() => JSON.parse(rangoInvalido.stdout), "un error en --json conserva stdout JSON parseable");
  assert.equal(JSON.parse(rangoInvalido.stdout).error.codigo, "GIT_RANGE_INVALID");

  const fuera = mkdtempSync(join(tmpdir(), "repofibe-no-git-"));
  try {
    writeFileSync(join(fuera, ".git"), "gitdir: ruta-inexistente\n");
    const sinRepo = correr([], fuera);
    assert.notEqual(sinRepo.status, 0, "un .git roto no debe reportarse como diff vacío");
    assert.doesNotThrow(() => JSON.parse(sinRepo.stdout), "el error de repositorio también produce JSON limpio");
    assert.equal(JSON.parse(sinRepo.stdout).error.codigo, "GIT_REPOSITORY_INVALID");
  } finally {
    rmSync(fuera, { recursive: true, force: true });
  }

  console.log("ok: diff vacío, evals afectadas, rango inválido, repositorio inválido y JSON limpio");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
