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
const GIT_GLOBAL = join(TEMP, "gitconfig");

process.env.REPOFIBE_SYNC_HOME = HOME;
process.env.GIT_CONFIG_GLOBAL = GIT_GLOBAL;
process.env.GIT_AUTHOR_NAME = "repofibe eval";
process.env.GIT_AUTHOR_EMAIL = "eval@repofibe.local";
process.env.GIT_COMMITTER_NAME = "repofibe eval";
process.env.GIT_COMMITTER_EMAIL = "eval@repofibe.local";
writeFileSync(GIT_GLOBAL, "[core]\n\tautocrlf = true\n");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitBytes(args, cwd) {
  return execFileSync("git", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
}

function bytesJsonl(lineas) {
  return Buffer.from(`${lineas.join("\n")}\n`, "utf8");
}

function validarJsonl(bytes, esperadas, contexto) {
  assert.deepEqual(bytes, bytesJsonl(esperadas), `${contexto}: bytes JSONL exactos`);
  const texto = bytes.toString("utf8");
  const lineas = texto.slice(0, -1).split("\n");
  assert.equal(lineas.length, esperadas.length, `${contexto}: cantidad de líneas`);
  const valores = lineas.map((linea) => JSON.parse(linea));
  assert.deepEqual(valores, esperadas.map((linea) => JSON.parse(linea)), `${contexto}: cada línea parsea como JSON`);
  return valores;
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
  const memoriaPath = join(fabrica, "memoria.jsonl");
  const localJsonl = [
    JSON.stringify({ tipo: "nota", ruta: "C:\\Users\\Ana\\proyecto", texto: "primera línea\nsegunda línea" }),
    JSON.stringify({ tipo: "nota", ruta: "C:/Users/Ana/proyecto", texto: "primera línea\nsegunda línea" }),
  ];
  const localJsonlBytes = bytesJsonl(localJsonl);
  writeFileSync(memoriaPath, localJsonlBytes);
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
  assert.equal(git(["-C", syncRepo, "config", "--local", "--get", "core.autocrlf"]), "false", "solo el repo espejo neutraliza autocrlf global");
  validarJsonl(gitBytes(["-C", syncRepo, "show", "HEAD:fabrica/memoria.jsonl"], syncRepo), localJsonl, "blob remoto después de push");
  validarJsonl(readFileSync(memoriaPath), localJsonl, "workspace después de push");
  // Simula un espejo preexistente de una versión que heredó autocrlf=true.
  git(["-C", syncRepo, "config", "--local", "--unset", "core.autocrlf"]);
  const memoriaEspejo = join(syncRepo, "fabrica", "memoria.jsonl");
  writeFileSync(memoriaEspejo, Buffer.from(readFileSync(memoriaEspejo, "utf8").replace(/\r?\n/g, "\r\n"), "utf8"));
  assert.equal(git(["-C", syncRepo, "config", "--get", "core.autocrlf"]), "true", "el espejo preexistente hereda autocrlf global");
  assert.match(readFileSync(memoriaEspejo, "utf8"), /\r\n/, "el espejo preexistente queda realmente en CRLF");
  const bytesLegacy = readFileSync(memoriaEspejo);
  const bytesEditados = Buffer.from(bytesLegacy.toString("utf8").replace("C:/Users/Ana", "C:/Users/Eve"), "utf8");
  writeFileSync(memoriaEspejo, bytesEditados);
  await assert.rejects(pull(fabrica), /cambios locales fuera de finales de línea/, "la migración rechaza ediciones reales del espejo");
  assert.deepEqual(readFileSync(memoriaEspejo), bytesEditados, "el fallo cerrado preserva los datos locales del espejo");
  writeFileSync(memoriaEspejo, bytesLegacy);
  assert.equal(readFileSync(authPath, "utf8"), authOriginal, "push no debe modificar auth local");
  assert.doesNotMatch(logs.join("\n"), new RegExp(token), "push no debe imprimir tokens");

  mkdirSync(WRITER, { recursive: true });
  git(["clone", "-q", REMOTE, WRITER]);
  assert.equal(git(["-C", WRITER, "config", "--get", "core.autocrlf"]), "true", "la regresión sí opera bajo una configuración global hostil");
  mkdirSync(join(WRITER, "fabrica", "auth"), { recursive: true });
  writeFileSync(join(WRITER, "fabrica", "auth", "remota.json"), JSON.stringify({ cookies: [{ value: "remote-only" }] }) + "\n");
  const remotoJsonl = [
    ...localJsonl,
    JSON.stringify({ tipo: "nota", ruta: "E:\\equipo\\remoto", texto: "remota\ncon salto escapado" }),
  ];
  writeFileSync(join(WRITER, "fabrica", "memoria.jsonl"), bytesJsonl(remotoJsonl));
  git(["add", "fabrica/auth/remota.json", "fabrica/memoria.jsonl"], WRITER);
  git(["commit", "-q", "-m", "remote auth and JSONL change"], WRITER);
  git(["push", "-q"], WRITER);
  validarJsonl(gitBytes(["-C", WRITER, "show", "HEAD:fabrica/memoria.jsonl"], WRITER), remotoJsonl, "blob del writer remoto");

  const pullLogs = [];
  console.log = (...args) => pullLogs.push(args.join(" "));
  try {
    await pull(fabrica);
  } finally {
    console.log = logOriginal;
  }
  assert.equal(readFileSync(authPath, "utf8"), authOriginal, "pull no debe sobreescribir auth local");
  assert.deepEqual(readFileSync(memoriaPath), bytesJsonl(remotoJsonl), "pull agrega la línea remota sin alterar bytes/escapes locales");
  assert.equal(git(["-C", syncRepo, "config", "--local", "--get", "core.autocrlf"]), "false", "pull migra el espejo preexistente a autocrlf=false");
  assert.deepEqual(readFileSync(memoriaEspejo), bytesJsonl(remotoJsonl), "la migración del espejo elimina CRLF sin duplicar entradas");
  const valoresWorkspace = validarJsonl(readFileSync(memoriaPath), remotoJsonl, "workspace después de pull");
  assert.deepEqual(valoresWorkspace.map(({ ruta, texto }) => [ruta, texto]), [
    ["C:\\Users\\Ana\\proyecto", "primera línea\nsegunda línea"],
    ["C:/Users/Ana/proyecto", "primera línea\nsegunda línea"],
    ["E:\\equipo\\remoto", "remota\ncon salto escapado"],
  ], "rutas Windows/POSIX y saltos sobreviven el parseo tras pull");
  assert.equal(existsSync(join(auth, "remota.json")), false, "pull no debe crear auth desde remoto");
  assert.doesNotMatch([...logs, ...pullLogs].join("\n"), new RegExp(token), "push/pull no deben imprimir tokens");
  git(["clone", "-q", REMOTE, INSPECT]);
  validarJsonl(gitBytes(["-C", INSPECT, "show", "HEAD:fabrica/memoria.jsonl"], INSPECT), remotoJsonl, "blob bare remoto tras pull");
  const checkoutRemoto = readFileSync(join(INSPECT, "fabrica", "memoria.jsonl"), "utf8");
  assert.deepEqual(checkoutRemoto.split("\n").filter(Boolean).map((linea) => JSON.parse(linea.replace(/\r$/, ""))), remotoJsonl.map((linea) => JSON.parse(linea)), "checkout remoto con CRLF sigue parseable sin alterar su blob");
  assert.equal(readFileSync(authPath, "utf8"), authOriginal, "auth local sigue idéntica después de todo el ciclo");
  console.log("ok: push/pull por Git preserva JSONL byte a byte, integra el cambio remoto y mantiene auth local");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
