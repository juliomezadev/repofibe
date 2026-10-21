#!/usr/bin/env node
// Reproduce la captura interactiva de storageState con Chromium aislado,
// confirmación por stdin y preservación de un perfil previo al cancelar.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TEMP = mkdtempSync(join(process.cwd(), ".sa03-auth-captura-"));
const AUTH = join(TEMP, ".fabrica", "auth");
mkdirSync(AUTH, { recursive: true });
const OLD = { version: "perfil-anterior", cookies: [], origins: [] };
const OLD_PATH = join(AUTH, "127.0.0.1.json");
writeFileSync(OLD_PATH, JSON.stringify(OLD));

const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "sa03-capture=ok; Path=/" });
    res.end("<!doctype html><title>Fixture de captura</title><script>localStorage.setItem('sa03-capture','ok')</script><h1>Fixture de autenticación</h1>");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Fixture de captura</title><h1>Sin estado de sesión</h1>");
});

function ejecutarGuardar(port, respuesta) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(REPO, "nucleo", "cookies.mjs"), "guardar", `http://127.0.0.1:${port}`], {
      cwd: TEMP,
      env: { ...process.env, REPOFIBE_DIR: TEMP },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let salida = "";
    let error = "";
    let respondio = false;
    const timer = setTimeout(async () => {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once("close", resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
      reject(new Error(`guardar no llegó a pedir confirmación a tiempo. stdout=${salida} stderr=${error}`));
    }, 12000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      salida += chunk;
      if (!respondio && /confirm|pulsa Enter/i.test(salida)) {
        respondio = true;
        // Escribe la respuesta solo después del aviso: la captura tiene que
        // conservar Chromium abierto hasta recibir esta confirmación.
        child.stdin.end(`${respuesta}\n`);
      }
    });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, salida, error, respondio });
    });
  });
}

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const cancelada = await ejecutarGuardar(port, "n");
  assert.ok(cancelada.respondio, `el CLI debe solicitar confirmación explícita. stdout=${cancelada.salida} stderr=${cancelada.error}`);
  assert.equal(cancelada.code, 0, `cancelación controlada debe terminar sin excepción. signal=${cancelada.signal} stdout=${cancelada.salida} stderr=${cancelada.error}`);
  assert.deepEqual(JSON.parse(readFileSync(OLD_PATH, "utf8")), OLD, "cancelar debe preservar el perfil anterior byte a byte semánticamente");

  const confirmada = await ejecutarGuardar(port, "s");
  assert.ok(confirmada.respondio, `el CLI debe solicitar confirmación antes de guardar. stdout=${confirmada.salida} stderr=${confirmada.error}`);
  assert.equal(confirmada.code, 0, `guardar confirmado debe terminar bien. stderr=${confirmada.error}`);
  const savedPath = readdirSync(AUTH).map((name) => join(AUTH, name)).find((path) => {
    try { return JSON.parse(readFileSync(path, "utf8")).cookies?.some((cookie) => cookie.name === "sa03-capture"); }
    catch { return false; }
  });
  assert.ok(savedPath, "la captura debe escribir un perfil de origen nuevo sin reemplazar el perfil legado");
  const saved = JSON.parse(readFileSync(savedPath, "utf8"));
  assert.ok(saved.cookies.some((cookie) => cookie.name === "sa03-capture"), "la captura debe incluir la cookie sintética puesta antes de confirmar");
  assert.ok(saved.origins.some((origin) => origin.origin === `http://127.0.0.1:${port}`), "la captura debe incluir localStorage del origen HTTP exacto");
  assert.match(confirmada.salida, /guardad|capturad/i);

  console.log("ok: CLI pide confirmación con Chromium vivo, cancela sin reemplazar el perfil y guarda cookie/localStorage sintéticos al confirmar");
} finally {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  try { rmSync(TEMP, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
  catch (error) { console.error(`omitido: no se pudo limpiar el home temporal aislado (${error.code})`); }
}
