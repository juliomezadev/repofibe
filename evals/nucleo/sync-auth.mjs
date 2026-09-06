#!/usr/bin/env node
// Regresión Batch 2: sync solo comparte memoria/notas; auth permanece local.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-sync-auth-"));
const HOME = join(TEMP, "home");
const PROJECT = join(TEMP, "project");
const SEED = join(TEMP, "seed");
const REMOTE = join(TEMP, "remote.git");
const WRITER = join(TEMP, "writer");
const INSPECT = join(TEMP, "inspect");

process.env.REPOFIBE_SYNC_HOME = HOME;
process.env.GIT_AUTHOR_NAME = "repofibe eval";
process.env.GIT_AUTHOR_EMAIL = "eval@repofibe.local";
process.env.GIT_COMMITTER_NAME = "repofibe eval";
process.env.GIT_COMMITTER_EMAIL = "eval@repofibe.local";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function prepararRepoInicial() {
  mkdirSync(SEED, { recursive: true });
  git(["init", "-q"], SEED);
  git(["config", "user.name", "seed"], SEED);
  git(["config", "user.email", "seed@repofibe.local"], SEED);
  writeFileSync(join(SEED, "README.md"), "sync\n");
  git(["add", "README.md"], SEED);
  git(["commit", "-q", "-m", "seed"], SEED);
  git(["branch", "-M", "main"], SEED);
  git(["init", "--bare", "-q", REMOTE]);
  git(["remote", "add", "origin", REMOTE], SEED);
  git(["push", "-q", "-u", "origin", "main"], SEED);
  git(["symbolic-ref", "HEAD", "refs/heads/main"], REMOTE);
}

try {
  prepararRepoInicial();
  mkdirSync(join(HOME, ".repofibe"), { recursive: true });
  writeFileSync(join(HOME, ".repofibe", "sync-config.json"), JSON.stringify({ repo: REMOTE }));

  const fabrica = join(PROJECT, ".fabrica");
  const auth = join(fabrica, "auth");
  mkdirSync(auth, { recursive: true });
  writeFileSync(join(fabrica, "memoria.jsonl"), JSON.stringify({ tipo: "nota", texto: "memoria compartible" }) + "\n");
  const token = "session-token-local-9f3e";
  const authOriginal = JSON.stringify({ cookies: [{ name: "session", value: token }] }, null, 2) + "\n";
  const authPath = join(auth, "ejemplo.com.json");
  writeFileSync(authPath, authOriginal);

  const { push, pull } = await import("../../nucleo/sync.mjs");
  const logs = [];
  const logOriginal = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    await push(fabrica);
  } finally {
    console.log = logOriginal;
  }

  const syncRepo = join(HOME, ".repofibe", "sync-repo");
  const archivosRemotos = git(["-C", syncRepo, "ls-tree", "-r", "--name-only", "HEAD"]);
  assert.match(archivosRemotos, /fabrica\/memoria\.jsonl/);
  assert.doesNotMatch(archivosRemotos, /fabrica\/auth\//);
  assert.equal(readFileSync(authPath, "utf8"), authOriginal, "push no debe modificar auth local");
  assert.doesNotMatch(logs.join("\n"), new RegExp(token), "push no debe imprimir tokens");

  mkdirSync(WRITER, { recursive: true });
  git(["clone", "-q", REMOTE, WRITER]);
  mkdirSync(join(WRITER, "fabrica", "auth"), { recursive: true });
  writeFileSync(join(WRITER, "fabrica", "auth", "remota.json"), JSON.stringify({ cookies: [{ value: "remote-only" }] }) + "\n");
  git(["add", "fabrica/auth/remota.json"], WRITER);
  git(["commit", "-q", "-m", "remote auth must not sync"], WRITER);
  git(["push", "-q"], WRITER);

  await pull(fabrica);
  assert.equal(readFileSync(authPath, "utf8"), authOriginal, "pull no debe sobreescribir auth local");
  assert.equal(existsSync(join(auth, "remota.json")), false, "pull no debe crear auth desde remoto");
  git(["clone", "-q", REMOTE, INSPECT]);
  assert.match(readFileSync(join(INSPECT, "fabrica", "memoria.jsonl"), "utf8"), /memoria compartible/);
  console.log("ok: push/pull de git preserva auth local, excluye auth del remoto y sincroniza memoria");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
