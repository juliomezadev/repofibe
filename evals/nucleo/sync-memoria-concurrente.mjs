#!/usr/bin/env node
// Regresión D2/F07: append de memoria y pull comparten el lock del archivo.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { conBloqueoExclusivoSync } from "../../nucleo/persistencia.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const MEMORIA = pathToFileURL(join(RAIZ, "nucleo", "memoria.mjs")).href;
const SYNC = pathToFileURL(join(RAIZ, "nucleo", "sync.mjs")).href;
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-memoria-merge-concurrente-"));
const PROJECT = join(TEMP, "proyecto");
const FABRICA = join(PROJECT, ".fabrica");
const DESTINO = join(FABRICA, "memoria.jsonl");
const REMOTO = join(TEMP, "remota.jsonl");
const LOCK = `${DESTINO}.lock`;
const ENV = { ...process.env, REPOFIBE_SYNC_HOME: join(TEMP, "sync-home"), REPOFIBE_TRAZA_DIR: join(TEMP, "trazas") };
const procesos = [];

function esperarCierre(proceso) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    proceso.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; });
    proceso.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
    proceso.once("error", reject);
    proceso.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`proceso ${proceso.pid} exit=${code}: ${stdout}${stderr}`)));
  });
}

function esperarMarcadores(marcadores, timeoutMs = 5_000) {
  const fin = Date.now() + timeoutMs;
  while (!marcadores.every(existsSync)) {
    if (Date.now() >= fin) throw new Error("los dos procesos no alcanzaron el punto concurrente");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}

try {
  mkdirSync(FABRICA, { recursive: true });
  const semilla = JSON.stringify({ id: "seed", tipo: "aprendizaje", texto: "ruta C:\\Users\\Ana\\base\nlocal inicial" });
  const contenidoSemilla = `${semilla}\r\n`;
  const evento = "registro agregado mientras ocurre pull";
  const remoto = JSON.stringify({ id: "remote", tipo: "decision", texto: "entrada remota" });
  writeFileSync(DESTINO, contenidoSemilla, "utf8");
  writeFileSync(REMOTO, `${remoto}\n`, "utf8");

  const markerAdd = join(TEMP, "add-ready");
  const markerPull = join(TEMP, "pull-ready");
  const addScript = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(markerAdd)}, "ready"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(MEMORIA))}, "agregar", "aprendizaje", ${JSON.stringify(evento)}]; await import(${JSON.stringify(MEMORIA)});`;
  const pullScript = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(markerPull)}, "ready"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); const { mergeJsonl } = await import(${JSON.stringify(SYNC)}); mergeJsonl(${JSON.stringify(DESTINO)}, ${JSON.stringify(REMOTO)});`;

  let addBloqueado;
  let pullBloqueado;
  conBloqueoExclusivoSync(LOCK, () => {
    addBloqueado = spawn(process.execPath, ["--input-type=module", "-e", addScript], { cwd: PROJECT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
    pullBloqueado = spawn(process.execPath, ["--input-type=module", "-e", pullScript], { cwd: PROJECT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
    procesos.push(addBloqueado, pullBloqueado);
    esperarMarcadores([markerAdd, markerPull]);
    // Ambos han iniciado la operación y se quedan esperando el mismo lock.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    assert.equal(addBloqueado.exitCode, null, "memoria agregar espera el lock compartido");
    assert.equal(pullBloqueado.exitCode, null, "mergeJsonl espera el lock compartido");
    assert.equal(readFileSync(DESTINO, "utf8"), contenidoSemilla, "ningún escritor reemplaza el destino durante la transacción protegida");
  });

  await Promise.all([esperarCierre(addBloqueado), esperarCierre(pullBloqueado)]);
  const contenidoFinal = readFileSync(DESTINO, "utf8");
  const registros = contenidoFinal.split("\n").filter(Boolean).map((linea) => JSON.parse(linea));
  assert.ok(contenidoFinal.startsWith(contenidoSemilla), "append y merge conservan ruta Windows, \n escapado y CRLF previos");
  assert.deepEqual(new Set(registros.map((registro) => registro.texto)), new Set(["ruta C:\\Users\\Ana\\base\nlocal inicial", evento, "entrada remota"]));
  assert.equal(registros.length, 3, "append local y pull remoto sobreviven ambos órdenes de lock");
  console.log("ok: memoria agregar y pull/merge se serializan sobre el mismo archivo sin perder entradas");
} finally {
  for (const proceso of procesos) if (proceso.exitCode === null) proceso.kill();
  await Promise.all(procesos.filter((proceso) => proceso.exitCode === null).map((proceso) => new Promise((resolve) => proceso.once("close", resolve))));
  rmSync(TEMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
