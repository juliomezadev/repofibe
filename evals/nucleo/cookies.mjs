#!/usr/bin/env node
// evals/nucleo/cookies.mjs — eval funcional de cookies.mjs
//
// Prueba las funciones puras (normalización, cargar/listar/retirar) sin
// Playwright, y la integración E2E (acción perfil + navegador.mjs) con
// Chromium real + servidor HTTP local cuando Playwright está disponible.

import { strictEqual, ok } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { normalizarDominio, cargar, listar, retirar, dirAuth } from "../../nucleo/cookies.mjs";
import { ejecutarScript } from "../../nucleo/navegador.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-cookies-eval-"));

function probarNormalizacion() {
  strictEqual(normalizarDominio("https://www.Ejemplo.COM/"), "ejemplo.com");
  strictEqual(normalizarDominio("http://tienda.com/path"), "tienda.com");
  strictEqual(normalizarDominio("EJEMPLO.COM"), "ejemplo.com");
  strictEqual(normalizarDominio("www.ejemplo.com/"), "ejemplo.com");
}

function probarCargarListarRetirar() {
  const state = {
    cookies: [{ name: "session", value: "abc123", domain: "ejemplo.com", path: "/", expires: -1 }],
    origins: [],
  };
  dirAuth(TEMP);
  writeFileSync(join(dirAuth(TEMP), "ejemplo.com.json"), JSON.stringify(state));

  const loaded = cargar("ejemplo.com", TEMP);
  ok(loaded);
  strictEqual(loaded.cookies.length, 1);
  strictEqual(loaded.cookies[0].name, "session");

  const loaded2 = cargar("https://www.Ejemplo.COM/", TEMP);
  ok(loaded2);
  strictEqual(loaded2.cookies[0].name, "session");

  const dominios = listar(TEMP);
  ok(dominios.includes("ejemplo.com"));

  ok(retirar("ejemplo.com", TEMP));
  strictEqual(cargar("ejemplo.com", TEMP), null);
  strictEqual(listar(TEMP).length, 0);

  ok(!retirar("noexiste.com", TEMP));
}

async function probarPerfilSiHayPlaywright() {
  let pw;
  try { pw = await import("playwright"); }
  catch {
    console.log("omitido: playwright no está instalado en este proyecto (repofibe es cero-deps) — instala con `npm install playwright && npx playwright install chromium` para correr esta prueba de integración real");
    return;
  }

  // Servidor local que muestra las cookies recibidas
  const servidor = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><body><h1>Cookies</h1><p>${req.headers.cookie || "ninguna"}</p></body></html>`);
  });
  await new Promise((r) => servidor.listen(0, r));
  const puerto = servidor.address().port;
  const url = `http://127.0.0.1:${puerto}`;

  // Crear storageState con cookie durable para el servidor local
  const state = {
    cookies: [{
      name: "repofibe-eval-cookie",
      value: "eval-pass",
      domain: "127.0.0.1",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 3600,
    }],
    origins: [],
  };
  dirAuth(TEMP);
  writeFileSync(join(dirAuth(TEMP), "127.0.0.1.json"), JSON.stringify(state));

  // Ejecutar script con acción perfil + navegar + snapshot
  const resultados = await ejecutarScript([
    { accion: "perfil", dominio: "127.0.0.1" },
    { accion: "navegar", url },
    { accion: "snapshot" },
  ], { headless: true, dirBase: TEMP, timeoutMs: 10000 });

  ok(resultados[0].ok, "perfil debía cargar storageState");
  ok(resultados[0].cookies > 0, "perfil debía reportar al menos 1 cookie");
  ok(resultados[1].ok, "navegar debía funcionar con storageState");

  const snapshot = resultados[2];
  ok(snapshot.ok, "snapshot debía funcionar");
  ok(snapshot.texto.includes("repofibe-eval-cookie"), `snapshot debía mostrar la cookie inyectada (texto: ${snapshot.texto.slice(0, 300)})`);

  // Sin perfil para dominio desconocido → error
  try {
    await ejecutarScript([
      { accion: "perfil", dominio: "noexiste.com" },
      { accion: "navegar", url: "https://noexiste.com" },
    ], { headless: true, dirBase: TEMP, timeoutMs: 5000 });
    ok(false, "debía fallar con dominio sin storageState");
  } catch (e) {
    ok(e.message.includes("No hay storageState"), `error debía mencionar storageState: ${e.message}`);
  }

  servidor.close();
}

try {
  probarNormalizacion();
  console.log("ok: normalización de dominio (protocolo, www, ruta, mayúsculas)");
  probarCargarListarRetirar();
  console.log("ok: ciclo completo (cargar con normalización, listar, retirar, doble retirar)");
  await probarPerfilSiHayPlaywright();
  console.log("ok: acción perfil + navegador.mjs inyecta storageState en Chromium real");
  console.log("Cookies: funciones puras verificadas siempre; integración con Chromium verificada si Playwright está disponible.");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}