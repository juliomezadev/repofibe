#!/usr/bin/env node
// Verifica el mismo listener interno de cookies.mjs sin exportarlo en la API:
// cierre del BrowserContext antes de confirmar debe resolver como cancelación.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const origen = join(REPO, "nucleo", "cookies.mjs");
const copia = join(REPO, "nucleo", `.cookies-auth-cierre-${process.pid}-${randomUUID()}.mjs`);
const fuente = readFileSync(origen, "utf8");
const exportFinal = "export { guardar, guardarEstado, cargar, listar, retirar, dirAuth, normalizarDominio };";
assert.ok(fuente.includes(exportFinal), "se requiere encontrar el punto de exports actual para instrumentar solo esta prueba");
writeFileSync(copia, fuente.replace(exportFinal, "export { guardar, guardarEstado, cargar, listar, retirar, dirAuth, normalizarDominio, esperarConfirmacion };"), "utf8");

try {
  const { esperarConfirmacion } = await import(pathToFileURL(copia).href);
  const contexto = new EventEmitter();
  const entrada = new PassThrough();
  const salida = new PassThrough();
  let texto = "";
  salida.setEncoding("utf8");
  salida.on("data", (parte) => { texto += parte; });

  const confirmacion = esperarConfirmacion(contexto, entrada, salida);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(texto, /pulsa Enter/i, "la persona ve la instrucción de confirmación mientras el contexto está vivo");
  contexto.emit("close");
  assert.equal(await confirmacion, false, "un BrowserContext cerrado antes de confirmar cancela la captura");
  entrada.end("s\n");
  assert.equal(contexto.listenerCount("close"), 0, "el listener de cierre se limpia después de cancelar");

  console.log("ok: cierre prematuro del contexto resuelve como cancelación y limpia el listener antes de cualquier escritura");
} finally {
  rmSync(copia, { force: true });
}
