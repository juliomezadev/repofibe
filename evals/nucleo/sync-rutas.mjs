#!/usr/bin/env node
// Regresión F06: JSONL conserva exactamente cada línea y solo deduplica bytes idénticos.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeJsonl, gitMerge3Way } from "../../nucleo/sync.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-sync-bytes-"));
function lineas(ruta) { return readFileSync(ruta, "utf8").split("\n").filter((linea) => linea.length > 0); }

try {
  const windows = JSON.stringify({ ruta: "C:\\Users\\Ana\\proyecto", texto: "primera\nsegunda" });
  const posix = JSON.stringify({ ruta: "C:/Users/Ana/proyecto", texto: "primera\nsegunda" });
  const local = join(TEMP, "local.jsonl");
  const remoto = join(TEMP, "remoto.jsonl");
  writeFileSync(local, windows + "\n", "utf8");
  writeFileSync(remoto, `${windows}\n${posix}\n`, "utf8");
  assert.equal(mergeJsonl(local, remoto), 1, "la repetición exacta se deduplica pero la ruta con slash distinto es otra línea");
  const dosVias = lineas(local);
  assert.equal(dosVias[0], windows, "la línea local sobrevive sin cambiar bytes");
  assert.equal(dosVias[1], posix, "la línea remota no se normaliza ni pierde escapes JSON \\n");
  assert.equal(JSON.parse(dosVias[0]).ruta, "C:\\Users\\Ana\\proyecto");
  assert.equal(JSON.parse(dosVias[0]).texto, "primera\nsegunda");

  const crlfLocal = join(TEMP, "local-crlf.jsonl");
  const crlfRemoto = join(TEMP, "remoto-crlf.jsonl");
  const otra = JSON.stringify({ ruta: "E:\\otra", texto: "nueva" });
  writeFileSync(crlfLocal, windows + "\r\n", "utf8");
  writeFileSync(crlfRemoto, otra + "\n", "utf8");
  assert.equal(mergeJsonl(crlfLocal, crlfRemoto), 1);
  assert.equal(lineas(crlfLocal)[0], `${windows}\r`, "el CR previo a LF queda intacto");

  const ancestor = join(TEMP, "anc.jsonl");
  const threeLocal = join(TEMP, "3local.jsonl");
  const threeRemote = join(TEMP, "3remote.jsonl");
  writeFileSync(ancestor, "", "utf8");
  writeFileSync(threeLocal, windows + "\n", "utf8");
  writeFileSync(threeRemote, posix + "\n", "utf8");
  assert.equal(gitMerge3Way(ancestor, threeLocal, threeRemote), true);
  const tresVias = lineas(threeLocal);
  assert.deepEqual(tresVias, [windows, posix], "3-way conserva líneas distintas aunque solo cambien los separadores");
  assert.equal(gitMerge3Way(ancestor, threeLocal, threeRemote), true);
  assert.deepEqual(lineas(threeLocal), [windows, posix], "3-way es idempotente con dedup exacto");

  // Ni un origen ni un destino inválidos se reemplazan por un merge parcial.
  const valido = join(TEMP, "valido.jsonl");
  const invalido = join(TEMP, "invalido.jsonl");
  const invalidoBytes = "{\"texto\":\"truncado\"\n";
  writeFileSync(valido, windows + "\n", "utf8");
  writeFileSync(invalido, invalidoBytes, "utf8");
  assert.throws(() => mergeJsonl(valido, invalido), /JSONL inválido/);
  assert.equal(readFileSync(valido, "utf8"), windows + "\n", "origen inválido deja intacto el destino válido");
  assert.throws(() => mergeJsonl(invalido, remoto), /JSONL inválido/);
  assert.equal(readFileSync(invalido, "utf8"), invalidoBytes, "destino inválido queda byte por byte intacto");
  const localAntes = readFileSync(threeLocal, "utf8");
  writeFileSync(threeRemote, invalidoBytes, "utf8");
  assert.equal(gitMerge3Way(ancestor, threeLocal, threeRemote), false, "3-way rechaza antes de escribir si una entrada es inválida");
  assert.equal(readFileSync(threeLocal, "utf8"), localAntes, "3-way no deja escritura parcial ante origen inválido");
  assert.equal(readdirSync(TEMP).some((nombre) => nombre.endsWith(".tmp")), false, "los fallos limpian solo sus temporales propios");
  console.log("ok: merge JSONL 2-way/3-way preserva rutas Windows, escapes de newline, CR y dedup exacto");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
