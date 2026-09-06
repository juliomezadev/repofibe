#!/usr/bin/env node
// Regresión Batch 3: el grafo debe corresponder al contenido consultado,
// incluido el working tree, y recuperarse de formatos antiguos/corruptos.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const GRAFO = join(RAIZ, "nucleo", "grafo.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-grafo-frescura-"));
const git = (args) => execFileSync("git", args, { cwd: TEMP, encoding: "utf8" }).trim();
const cli = (args) => execFileSync(process.execPath, [GRAFO, ...args], { cwd: TEMP, encoding: "utf8" });
const leer = () => JSON.parse(readFileSync(join(TEMP, ".fabrica", "grafo.json"), "utf8"));

try {
  execFileSync("git", ["init", "-q"], { cwd: TEMP });
  git(["config", "user.name", "eval"]);
  git(["config", "user.email", "eval@repofibe.local"]);
  writeFileSync(join(TEMP, "core.mjs"), "export const value = 1;\n");
  writeFileSync(join(TEMP, "consumer.mjs"), "import { value } from './core.mjs';\nexport const result = value;\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "commit A"]);
  cli(["generar"]);
  const commitA = git(["rev-parse", "HEAD"]);
  let grafo = leer();
  assert.equal(grafo.version, 2);
  assert.equal(grafo.fuente.commit, commitA);
  assert.equal(grafo.fuente.sucio, false);

  cli(["impacto", "core.mjs"]);
  assert.equal(leer().fuente.commit, commitA, "un grafo fresco se reutiliza en A");

  writeFileSync(join(TEMP, "core.mjs"), "export const value = 2;\n");
  git(["add", "core.mjs"]);
  git(["commit", "-qm", "commit B"]);
  const commitB = git(["rev-parse", "HEAD"]);
  const stale = cli(["frescura"]);
  assert.match(stale, /NO CONFIABLE/);
  cli(["impacto", "core.mjs"]);
  grafo = leer();
  assert.equal(grafo.fuente.commit, commitB, "la consulta no reutiliza el grafo de A en B");

  writeFileSync(join(TEMP, "consumer.mjs"), "import { value } from './core.mjs';\nexport const result = value + 1;\n");
  const dirty = cli(["frescura"]);
  assert.match(dirty, /NO CONFIABLE/);
  cli(["impacto", "core.mjs"]);
  grafo = leer();
  assert.equal(grafo.fuente.commit, commitB);
  assert.equal(grafo.fuente.sucio, true, "el grafo dirty no se etiqueta como commit limpio");
  assert.ok(grafo.fuente.fingerprint, "el working tree usa fingerprint reproducible");
  assert.match(cli(["frescura"]), /confiable/);

  writeFileSync(join(TEMP, ".fabrica", "grafo.json"), JSON.stringify({ generado: new Date().toISOString(), commit: commitB, archivos: 2, aristas: {} }));
  cli(["impacto", "core.mjs"]);
  assert.equal(leer().version, 2, "el grafo legacy se regenera con metadata nueva");

  writeFileSync(join(TEMP, ".fabrica", "grafo.json"), "{corrupto");
  const recuperado = cli(["impacto", "core.mjs"]);
  assert.match(recuperado, /Grafo generado|IMPACTO/);
  assert.equal(leer().version, 2, "el grafo corrupto se recupera sin excepción no controlada");

  console.log("ok: frescura por commit y fingerprint, working tree explícito, legacy y corrupción controlados");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
