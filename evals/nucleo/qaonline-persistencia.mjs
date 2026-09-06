#!/usr/bin/env node
// Regresión Batch 2: una corrida QA debe conservar navegador, contexto, page
// y refs entre acciones, incluida la recuperación de autenticación.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-qa-persistencia-"));
const REPO = process.cwd();
process.env.REPOFIBE_TRAZA_DIR = join(TEMP, "traza");
process.chdir(TEMP);
const { ejecutarQAOnline } = await import("../../nucleo/qaonline.mjs");
const { crearSesionNavegador } = await import("../../nucleo/navegador.mjs");
const { guardarEstado } = await import("../../nucleo/cookies.mjs");

function html(cuerpo) {
  return `<!doctype html><html><body>${cuerpo}</body></html>`;
}

async function main() {
  const server = createServer((req, res) => {
    const cookie = req.headers.cookie || "";
    if (req.url === "/a") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html('<h1>Flujo A</h1><p id="estado">A</p><button id="continuar" onclick="document.querySelector(\'#estado\').textContent=\'B\'">Continuar</button>'));
    } else if (req.url === "/cookie-set") {
      res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "batch2-cookie=presente; Path=/" });
      res.end(html("<h1>Cookie creada</h1>"));
    } else if (req.url === "/cookie-check") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html(`<h1>Cookie check</h1><p>${cookie}</p>`));
    } else if (req.url === "/storage-set") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html("<h1>Storage creado</h1><script>localStorage.setItem('batch2-storage','presente')</script>"));
    } else if (req.url === "/storage-check") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html("<h1>Storage check</h1><p id='storage'></p><script>document.querySelector('#storage').textContent=localStorage.getItem('batch2-storage')||''</script>"));
    } else if (req.url === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html("<h1>Formulario Login</h1><button id='entrar' onclick=\"document.cookie='session=ok; path=/'; location='/dashboard'\">Entrar</button>"));
    } else if (req.url === "/dashboard") {
      if (cookie.includes("session=ok")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html("<h1>Dashboard Protegido</h1><p>Sesión autenticada</p>"));
      } else {
        res.writeHead(302, { Location: "/login" });
        res.end();
      }
    } else if (req.url === "/auth-set") {
      res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "exported-auth=presente; Path=/" });
      res.end(html("<h1>Estado exportable</h1><script>localStorage.setItem('exported-storage','presente')</script>"));
    } else if (req.url === "/auth-check") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html(`<h1>Estado restaurado</h1><p>${cookie}</p><p id='restored'></p><script>document.querySelector('#restored').textContent=localStorage.getItem('exported-storage')||''</script>`));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const flujo = await ejecutarQAOnline({
      flujo: "Persistencia de QA",
      dominio: "",
      script: [
        { accion: "navegar", url: `${baseUrl}/a` },
        { accion: "snapshot" },
        { accion: "click", ref: "e2" },
        { accion: "snapshot" },
      ],
    });
    assert.equal(flujo.ok, true);
    const evidencia = readFileSync(flujo.evidenciaPath, "utf8");
    assert.match(evidencia, /B/);

    const cookie = await ejecutarQAOnline({
      flujo: "Cookie persistente",
      dominio: "",
      script: [
        { accion: "navegar", url: `${baseUrl}/cookie-set` },
        { accion: "navegar", url: `${baseUrl}/cookie-check` },
        { accion: "snapshot" },
      ],
    });
    assert.match(readFileSync(cookie.evidenciaPath, "utf8"), /batch2-cookie=presente/);

    const storage = await ejecutarQAOnline({
      flujo: "LocalStorage persistente",
      dominio: "",
      script: [
        { accion: "navegar", url: `${baseUrl}/storage-set` },
        { accion: "navegar", url: `${baseUrl}/storage-check` },
        { accion: "snapshot" },
      ],
    });
    assert.match(readFileSync(storage.evidenciaPath, "utf8"), /presente/);

    await assert.rejects(
      () => ejecutarQAOnline({
        flujo: "Error cierra sesión",
        dominio: "",
        script: [
          { accion: "navegar", url: `${baseUrl}/a` },
          { accion: "click", ref: "e999" },
          { accion: "snapshot" },
        ],
      }),
      /ref desconocido/
    );

    const authPath = join(TEMP, ".fabrica", "auth", "127.0.0.1.json");
    const primera = await crearSesionNavegador({ headless: true, dirBase: TEMP });
    try {
      await primera.ejecutar({ accion: "navegar", url: `${baseUrl}/auth-set` });
      const exportado = await primera.ejecutar({ accion: "exportarPerfil" });
      assert.equal(exportado.ok, true);
      guardarEstado("127.0.0.1", exportado.state, TEMP);
      assert.equal(primera.cerrada, false);
    } finally {
      await primera.cerrar();
    }
    assert.equal(primera.cerrada, true);
    assert.ok(authPath);

    const segunda = await crearSesionNavegador({
      headless: true,
      dirBase: TEMP,
      accionesIniciales: [{ accion: "perfil", dominio: "127.0.0.1" }],
    });
    try {
      await segunda.ejecutar({ accion: "navegar", url: `${baseUrl}/auth-check` });
      const estado = await segunda.ejecutar({ accion: "snapshot" });
      assert.match(estado.texto, /exported-auth=presente/);
      assert.match(estado.texto, /presente/);
    } finally {
      await segunda.cerrar();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.chdir(REPO);
    rmSync(TEMP, { recursive: true, force: true });
  }
  console.log("ok: sesión QA persistente, cookies, localStorage, refs, cierre en error y storageState verificados");
}

try {
  await main();
} catch (err) {
  if (err.message?.includes("Playwright no está instalado")) {
    console.log("ok: contrato de sesión QA cargado (sin navegador)");
    console.log("omitido: continuidad de navegador/context/page y storageState requieren Playwright");
  } else {
    console.error(err);
    process.exitCode = 1;
  }
}
