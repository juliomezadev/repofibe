#!/usr/bin/env node
// Regresión Batch 3: pull propaga errores reales y no declara éxito tras fallar.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-sync-pull-"));
const HOME = join(TEMP, "home");
const SEED = join(TEMP, "seed");
const REMOTE = join(TEMP, "remote.git");
const WRITER = join(TEMP, "writer");
const PROJECT = join(TEMP, "project");

process.env.REPOFIBE_SYNC_HOME = HOME;
process.env.GIT_AUTHOR_NAME = "repofibe eval";
process.env.GIT_AUTHOR_EMAIL = "eval@repofibe.local";
process.env.GIT_COMMITTER_NAME = "repofibe eval";
process.env.GIT_COMMITTER_EMAIL = "eval@repofibe.local";

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(cwd, mensaje, archivo) {
  git(["add", archivo], cwd);
  git(["commit", "-q", "-m", mensaje], cwd);
}

function configurarRepo() {
  mkdirSync(SEED, { recursive: true });
  git(["init", "-q"], SEED);
  git(["config", "user.name", "seed"], SEED);
  git(["config", "user.email", "seed@repofibe.local"], SEED);
  mkdirSync(join(SEED, "fabrica"), { recursive: true });
  writeFileSync(join(SEED, "fabrica", "memoria.jsonl"), '{"tipo":"nota","texto":"base"}\n');
  commit(SEED, "base", "fabrica/memoria.jsonl");
  git(["branch", "-M", "main"], SEED);
  git(["init", "--bare", "-q", REMOTE]);
  git(["remote", "add", "origin", REMOTE], SEED);
  git(["push", "-q", "-u", "origin", "main"], SEED);
  git(["symbolic-ref", "HEAD", "refs/heads/main"], REMOTE);
  mkdirSync(join(HOME, ".repofibe"), { recursive: true });
  writeFileSync(join(HOME, ".repofibe", "sync-config.json"), JSON.stringify({ repo: REMOTE }));
  mkdirSync(join(PROJECT, ".fabrica"), { recursive: true });
}

try {
  configurarRepo();
  const { pull, clasificarErrorSync } = await import("../../nucleo/sync.mjs");

  const primero = await pull(join(PROJECT, ".fabrica"));
  assert.equal(primero.ok, true);
  assert.equal(primero.estado, "sin-cambios", "un clone sin cambios posteriores debe quedar actualizado");

  git(["clone", "-q", REMOTE, WRITER]);
  writeFileSync(join(WRITER, "fabrica", "memoria.jsonl"), '{"tipo":"nota","texto":"remota"}\n');
  commit(WRITER, "cambio remoto", "fabrica/memoria.jsonl");
  git(["push", "-q"], WRITER);
  const actualizado = await pull(join(PROJECT, ".fabrica"));
  assert.equal(actualizado.estado, "actualizado");
  assert.match(readFileSync(join(PROJECT, ".fabrica", "memoria.jsonl"), "utf8"), /remota/);

  // Divergencia real: el checkout local y el remoto modifican la misma línea.
  writeFileSync(join(HOME, ".repofibe", "sync-repo", "fabrica", "memoria.jsonl"), '{"tipo":"nota","texto":"local"}\n');
  commit(join(HOME, ".repofibe", "sync-repo"), "cambio local", "fabrica/memoria.jsonl");
  writeFileSync(join(WRITER, "fabrica", "memoria.jsonl"), '{"tipo":"nota","texto":"remota-conflictiva"}\n');
  commit(WRITER, "cambio remoto conflictivo", "fabrica/memoria.jsonl");
  git(["push", "-q"], WRITER);

  const logs = [];
  const logOriginal = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    await assert.rejects(
      () => pull(join(PROJECT, ".fabrica")),
      (error) => error.codigo === "conflicto" && error.syncSuccess === false,
    );
  } finally {
    console.log = logOriginal;
  }
  assert.doesNotMatch(logs.join("\n"), /Cambios sincronizados|ya estaba actualizado/);

  assert.equal(clasificarErrorSync({ stderr: Buffer.from("Authentication failed") }), "autenticacion");
  assert.equal(clasificarErrorSync({ stderr: Buffer.from("repository not found") }), "remoto-inexistente");
  assert.equal(clasificarErrorSync({ stderr: Buffer.from("Could not resolve host") }), "red");

  const badHome = join(TEMP, "bad-home");
  mkdirSync(join(badHome, ".repofibe"), { recursive: true });
  writeFileSync(join(badHome, ".repofibe", "sync-config.json"), JSON.stringify({ repo: join(TEMP, "missing.git") }));
  const falloRemoto = spawnSync(process.execPath, [join(RAIZ, "nucleo", "sync.mjs"), "pull"], {
    cwd: RAIZ,
    env: { ...process.env, REPOFIBE_SYNC_HOME: badHome },
    encoding: "utf8",
  });
  assert.notEqual(falloRemoto.status, 0, "un remoto inexistente debe fallar");
  assert.match(`${falloRemoto.stdout}\n${falloRemoto.stderr}`, /remoto-inexistente/);
  assert.doesNotMatch(`${falloRemoto.stdout}\n${falloRemoto.stderr}`, /Cambios sincronizados|ya estaba actualizado/);

  console.log("ok: sync pull distingue éxito, sin cambios, conflicto, remoto inexistente y errores de red/auth");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
