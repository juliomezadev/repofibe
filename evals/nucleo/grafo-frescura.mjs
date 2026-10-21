#!/usr/bin/env node
// Regresión Batch 3: el grafo debe corresponder al contenido consultado,
// incluido el working tree, y recuperarse de formatos antiguos/corruptos.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const GRAFO = join(RAIZ, "nucleo", "grafo.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-grafo-frescura-"));
const git = (args) => execFileSync("git", args, { cwd: TEMP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cli = (args) => execFileSync(process.execPath, [GRAFO, ...args], { cwd: TEMP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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

  // F12: un cambio exclusivo de resolver config debe invalidar y recalcular
  // tanto la metadata de frescura como las aristas derivadas de alias.
  mkdirSync(join(TEMP, "src"), { recursive: true });
  mkdirSync(join(TEMP, "alt"), { recursive: true });
  writeFileSync(join(TEMP, "base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
  writeFileSync(join(TEMP, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
  writeFileSync(join(TEMP, "src", "mod.mjs"), "export const value = 1;\n");
  writeFileSync(join(TEMP, "alt", "mod.mjs"), "export const value = 2;\n");
  writeFileSync(join(TEMP, "consumer.mjs"), "import { value } from '@/mod';\nexport { value };\n");
  cli(["generar"]);
  assert.ok(leer().aristas["consumer.mjs"].includes("src/mod.mjs"), "el alias configurado apunta a src");
  writeFileSync(join(TEMP, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["alt/*"] } } }));
  assert.match(cli(["frescura"]), /NO CONFIABLE/, "editar solo paths debe invalidar el grafo");
  cli(["impacto", "alt/mod.mjs"]);
  assert.ok(leer().aristas["consumer.mjs"].includes("alt/mod.mjs"), "regenerar aplica la nueva configuración de paths");
  writeFileSync(join(TEMP, "base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
  writeFileSync(join(TEMP, "tsconfig.json"), JSON.stringify({ extends: "./base.json" }));
  cli(["generar"]);
  assert.ok(leer().aristas["consumer.mjs"].includes("src/mod.mjs"), "el alias heredado apunta a src");
  writeFileSync(join(TEMP, "base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["alt/*"] } } }));
  assert.match(cli(["frescura"]), /NO CONFIABLE/, "editar solo una configuración extends debe invalidar el grafo");
  cli(["impacto", "alt/mod.mjs"]);
  assert.ok(leer().aristas["consumer.mjs"].includes("alt/mod.mjs"), "regenerar aplica la configuración extendida nueva");
  writeFileSync(join(TEMP, "base.json"), JSON.stringify({ extends: "./tsconfig.json" }));
  assert.match(cli(["frescura"]), /NO CONFIABLE/, "un ciclo extends no debe considerarse configuración confiable");
  assert.throws(() => cli(["impacto", "alt/mod.mjs"]), /NO CONFIABLE|configuraci[oó]n/i,
    "un ciclo extends no genera una consulta confiable");
  writeFileSync(join(TEMP, "tsconfig.json"), JSON.stringify({ extends: "./falta.json" }));
  assert.match(cli(["frescura"]), /NO CONFIABLE/, "un extends local ausente no se considera confiable");
  assert.throws(() => cli(["impacto", "alt/mod.mjs"]), /NO CONFIABLE|configuraci[oó]n/i,
    "un extends local ausente impide consultar el grafo");
  writeFileSync(join(TEMP, "tsconfig.json"), "{ no es json }");
  assert.match(cli(["frescura"]), /NO CONFIABLE/, "una configuración ilegible no se considera confiable");

  console.log("ok: frescura por commit, fingerprint, configs extendidas y ciclos controlados");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
