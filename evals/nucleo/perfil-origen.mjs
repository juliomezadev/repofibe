#!/usr/bin/env node
// Verifica que los perfiles mantienen clave por hostname y que localStorage
// solo se restaura en el origen completo que contiene el storageState.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TEMP = mkdtempSync(join(process.cwd(), ".sa03-perfil-origen-"));
const TRAZAS = join(TEMP, "trazas");
mkdirSync(TRAZAS, { recursive: true });
process.env.REPOFIBE_TRAZA_DIR = TRAZAS;
process.env.REPOFIBE_DIR = TEMP;
const { crearSesionNavegador } = await import("../../nucleo/navegador.mjs");
const { cargar, guardarEstado, dirAuth } = await import("../../nucleo/cookies.mjs");

function html() {
  return `<!doctype html><html><body>
    <h1 id="token">Token empty</h1>
    <script>document.querySelector('#token').textContent='Token '+(localStorage.getItem('sa03-token') || 'empty')</script>
    <button>Acción</button>
  </body></html>`;
}

async function servidor() {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function iniciarDaemon(originOtro, originPerfil) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(REPO, "nucleo", "navegador.mjs"), "daemon"], {
      cwd: TEMP,
      env: { ...process.env, REPOFIBE_DIR: TEMP, REPOFIBE_TRAZA_DIR: TRAZAS },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const entrada = readline.createInterface({ input: child.stdout });
    const mensajes = [];
    const esperas = [];
    let siguienteMsg = 0;
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    entrada.on("line", (line) => {
      try {
        const mensaje = JSON.parse(line);
        const indice = esperas.findIndex((espera) => espera.test(mensaje));
        if (indice >= 0) esperas.splice(indice, 1)[0].resolve(mensaje);
        else mensajes.push(mensaje);
      } catch { /* ignora salida no JSON del proceso */ }
    });

    const esperar = (test) => {
      const indice = mensajes.findIndex(test);
      if (indice >= 0) return Promise.resolve(mensajes.splice(indice, 1)[0]);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          const indiceEspera = esperas.findIndex((e) => e.resolve === res);
          if (indiceEspera >= 0) esperas.splice(indiceEspera, 1);
          rej(new Error(`timeout del daemon. stderr=${stderr}`));
        }, 20000);
        esperas.push({ test, resolve: (value) => { clearTimeout(timer); res(value); } });
      });
    };
    const enviar = async (accion, campos = {}) => {
      const msgId = `sa03-${++siguienteMsg}`;
      const respuesta = esperar((m) => m.msgId === msgId);
      child.stdin.write(`${JSON.stringify({ accion, ...campos, msgId })}\n`);
      return respuesta;
    };
    child.once("error", reject);
    const procesoTerminado = new Promise((resolveTerminado, rejectTerminado) => child.once("close", (code) => {
      entrada.close();
      if (code !== 0) rejectTerminado(new Error(`daemon terminó con código ${code}. stderr=${stderr}`));
      else resolveTerminado();
    }));
    esperar((m) => m.status === "ready").then(async () => {
      try {
        const navega = await enviar("navegar", { url: `${originOtro}/` });
        assert.equal(navega.ok, true);
        const snapshot = await enviar("snapshot");
        assert.ok(snapshot.texto.includes("empty"), `snapshot del daemon no reflejó el DOM fixture: ${snapshot.texto}`);
        const perfil = await enviar("perfil", { dominio: originPerfil });
        assert.equal(perfil.ok, true);
        const refCaducada = await enviar("click", { ref: "e2" });
        assert.equal(refCaducada.ok, false, "perfil debe invalidar las refs de la page anterior");
        const navegaOrigen = await enviar("navegar", { url: `${originPerfil}/` });
        assert.equal(navegaOrigen.ok, true);
        const snapshotOrigen = await enviar("snapshot");
        assert.ok(snapshotOrigen.texto.includes("token-A"), "daemon debe recrear el contexto con storageState del origen matching");
        const navegaOtro = await enviar("navegar", { url: `${originOtro}/` });
        assert.equal(navegaOtro.ok, true);
        const snapshotOtro = await enviar("snapshot");
        assert.ok(snapshotOtro.texto.includes("empty"), "localStorage no debe filtrarse al otro puerto del mismo host");
        await enviar("close");
        await procesoTerminado;
        resolve();
      } catch (error) {
        try { await enviar("close"); await procesoTerminado; }
        catch {
          try { child.kill(); } catch {}
          try { await Promise.race([procesoTerminado, new Promise((r) => setTimeout(r, 5000))]); } catch {}
        }
        reject(error);
      }
    }).catch(async (error) => {
      try { child.kill(); } catch {}
      try { await Promise.race([procesoTerminado, new Promise((r) => setTimeout(r, 5000))]); } catch {}
      reject(error);
    });
  });
}

let servidorA;
let servidorB;
let session;
try {
  [servidorA, servidorB] = await Promise.all([servidor(), servidor()]);
  const originA = servidorA.origin;
  const originB = servidorB.origin;
  const state = {
    cookies: [],
    origins: [
      { origin: originA, localStorage: [{ name: "sa03-token", value: "token-A" }] },
      { origin: originB, localStorage: [{ name: "sa03-token", value: "token-B-no-debe-persistir" }] },
    ],
  };
  guardarEstado(originA, state, TEMP);
  const guardado = cargar(originA, TEMP);
  assert.deepEqual(guardado.origins.map((item) => item.origin), [originA], "la escritura debe filtrar origins ajenos");
  assert.ok(dirAuth(TEMP).endsWith(".fabrica\\auth") || dirAuth(TEMP).endsWith(".fabrica/auth"));
  assert.throws(() => cargar(originB, TEMP), /pertenece|origen/i, "el mismo hostname en otro puerto no debe cargar el perfil de A");

  session = await crearSesionNavegador({ headless: true, dirBase: TEMP });
  try {
    await session.ejecutar({ accion: "navegar", url: `${originB}/` });
    assert.equal(await session.page.evaluate(() => localStorage.getItem("sa03-token")), null);
    const refs = await session.ejecutar({ accion: "snapshot" });
    assert.ok(refs.refs >= 1);
    const cambiado = await session.ejecutar({ accion: "perfil", dominio: originA });
    assert.equal(cambiado.ok, true);
    assert.equal(Object.keys(session.refs).length, 0, "perfil debe limpiar las refs de la sesión reemplazada");
    const refVieja = await session.ejecutar({ accion: "click", ref: "e2" });
    assert.equal(refVieja.ok, false);
    await session.ejecutar({ accion: "navegar", url: `${originA}/` });
    assert.equal(await session.page.evaluate(() => localStorage.getItem("sa03-token")), "token-A");
    await session.ejecutar({ accion: "navegar", url: `${originB}/` });
    assert.equal(await session.page.evaluate(() => localStorage.getItem("sa03-token")), null, "el token no cruza al otro puerto");
  } finally {
    await session.cerrar();
  }

  await iniciarDaemon(originB, originA);
  console.log("ok: clave por hostname, origen completo para localStorage, refs invalidadas y contexto dinámico en sesión y daemon");
} finally {
  await session?.cerrar().catch(() => {});
  if (servidorA) await new Promise((resolve) => servidorA.server.close(resolve));
  if (servidorB) await new Promise((resolve) => servidorB.server.close(resolve));
  process.chdir(REPO);
  try { rmSync(TEMP, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
  catch (error) { console.error(`omitido: no se pudo limpiar el home temporal aislado (${error.code})`); }
}
