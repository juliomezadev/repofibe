#!/usr/bin/env node
// Regresión F05: JSON y JSONL válidos deben quedar redactados y parseables.
// Solo se usan valores sintéticos; no hay credenciales reales.

import { strict as assert } from "node:assert";
import { redactar } from "../../nucleo/secretos.mjs";

const pass = "JsonlPass" + "word-2026!";
const token = "JsonlToken" + "Value-2026!";
const aws = "A".repeat(40);
const documentos = [
  JSON.stringify({ id: 1, password: pass, access_token: token }),
  JSON.stringify({ id: 2, nested: { client_secret: pass }, aws_secret_access_key: aws }),
  JSON.stringify({ id: 3, password: "changeme", client_secret: "${CLIENT_SECRET}" }),
];
const entrada = documentos.join("\n");
const { texto, hallazgos } = redactar(entrada);

assert.ok(!texto.includes(pass), "no debe quedar visible la contraseña sintética");
assert.ok(!texto.includes(token), "no debe quedar visible el token sintético");
assert.ok(!texto.includes(aws), "no debe quedar visible la clave AWS sintética");
assert.ok(hallazgos.length > 0, "se deben reportar hallazgos");

const lineas = texto.split("\n");
assert.equal(lineas.length, documentos.length, "la redacción debe conservar una línea por registro");
const parseados = lineas.map((linea, indice) => {
  try { return JSON.parse(linea); }
  catch (error) { assert.fail(`la línea JSONL ${indice + 1} dejó de ser válida: ${error.message}`); }
});
assert.equal(parseados[0].id, 1);
assert.equal(parseados[0].password, "<REDACTADO:asignacion_generica>");
assert.equal(parseados[0].access_token, "<REDACTADO:asignacion_generica>");
assert.equal(parseados[1].nested.client_secret, "<REDACTADO:asignacion_generica>");
assert.equal(parseados[1].aws_secret_access_key, "<REDACTADO:aws_secret_key>");
assert.equal(lineas[2], documentos[2], "placeholders JSON conocidos deben conservarse sin cambios");

console.log("ok: JSONL sintético redactado conserva estructura, cantidad de líneas y parseabilidad");
