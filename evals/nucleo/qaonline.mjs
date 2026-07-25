#!/usr/bin/env node
// Aislar la telemetría ANTES de importar nada que trace. Sin esto, cada
// corrida de la suite escribía en el `.fabrica/traza.jsonl` REAL del
// proyecto un span `qaonline: Test Dashboard Mock` con estado de fallo —
// el mock falla a propósito, pero en la traza queda indistinguible de un
// fallo de verdad. Envenenar la observabilidad con datos de prueba degrada
// justo aquello que se construyó para decidir con evidencia: al auditar,
// esos fallos falsos se tomaron por una pista real y costaron tiempo.
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const DIR_TRAZA = mkdtempSync(join(tmpdir(), "repofibe-qaonline-traza-"));
process.env.REPOFIBE_TRAZA_DIR = DIR_TRAZA;
process.on("exit", () => { try { rmSync(DIR_TRAZA, { recursive: true, force: true }); } catch {} });

const { ejecutarQAOnline } = await import("../../nucleo/qaonline.mjs");
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";

async function main() {
  // 1. Levantar servidor HTTP local mockeado
  let sessionValid = false;
  const server = createServer((req, res) => {
    const isAuth = req.headers.cookie && req.headers.cookie.includes("session=ok");
    
    if (req.url === "/dashboard") {
      if (isAuth || sessionValid) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Dashboard Protegido</h1><button>Acción</button>");
      } else {
        res.writeHead(302, { "Location": "/login" });
        res.end();
      }
    } else if (req.url === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Formulario Login</h1><input id='u'/><button id='b'>Entrar</button>");
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2. Ejecutar QA en Vivo con macro de Self-Healing Auth
    const res = await ejecutarQAOnline({
      flujo: "Test Dashboard Mock",
      dominio: "127.0.0.1",
      script: [
        { accion: "navegar", url: `${baseUrl}/dashboard` },
        { accion: "snapshot" }
      ],
      macroLogin: [
        { accion: "navegar", url: `${baseUrl}/login` },
        { accion: "snapshot" }
      ]
    });

    if (!res.ok) {
      console.error("Error: QA en Vivo falló en la corrida de prueba", res);
      process.exit(1);
    }

    if (!existsSync(res.evidenciaPath)) {
      console.error("Error: No se generó el archivo de evidencia Markdown", res.evidenciaPath);
      process.exit(1);
    }

    const md = readFileSync(res.evidenciaPath, "utf8");
    if (!md.includes("Evidencia de QA en Vivo")) {
      console.error("Error: Contenido de evidencia inválido");
      process.exit(1);
    }

    console.log("ok: /repofibe-qaonline con Self-Healing y Evidencia en Markdown verificado");
  } catch (err) {
    if (err.message && err.message.includes("Playwright no está instalado")) {
      // Antes esta rama decía "ok: ... contratos y pipeline de fallback
      // verificados", y con ese prefijo la agregación de tier 1 la contaba
      // como suite verificada de punta a punta. La consecuencia: la función
      // ESTRELLA de esta skill —la auto-curación de login (Self-Healing)—
      // aparecía verificada sin haberse ejecutado jamás, porque necesita un
      // navegador real. Se adopta la convención "omitido:" para que la suite
      // la declare parcial (encontrado auditando, 2026-07-25).
      console.log("ok: contratos y pipeline de fallback verificados (sin navegador)");
      console.log("omitido: Self-Healing Auth y evidencia en Markdown NO se probaron — requieren Playwright. " +
        "La función principal de esta skill queda SIN verificar: `npm install playwright && npx playwright install chromium`");
    } else {
      throw err;
    }
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
