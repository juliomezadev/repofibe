#!/usr/bin/env node
// qaonline.mjs — Orquestador de QA en Vivo con Self-Healing Auth y Evidencia Determinista.

import { ejecutarScript } from "./navegador.mjs";
import { guardar as guardarAuth } from "./cookies.mjs";
import { withTrace, flushSyncEmergencia } from "./traza.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export async function ejecutarQAOnline({
  flujo = "QA en Vivo",
  dominio = "localhost",
  script = [],
  macroLogin = null,
  patronLogin = ["/login", "/signin", "/auth"],
  dirBase = undefined
} = {}) {
  const runner = withTrace(`qaonline: ${flujo}`, async () => {
    const evidencia = [];
    const erroresConsola = [];
    const erroresRed = [];

    // Preparar script con perfil si no viene implícito
    const accionesOriginales = [...script];
    if (dominio && !accionesOriginales.some(a => a.accion === "perfil")) {
      accionesOriginales.unshift({ accion: "perfil", dominio });
    }

    let paso = 0;
    for (const accion of accionesOriginales) {
      paso++;
      const res = await ejecutarScript([accion], { dirBase });
      const itemRes = res[0] || res;

      // Detección de redirección a Login (Self-Healing Auth)
      const urlActual = itemRes.url || "";
      const esLogin = patronLogin.some(pat => urlActual.includes(pat));

      if (esLogin && macroLogin && accion.accion !== "perfil") {
        evidencia.push({ paso, accion: "self-healing-trigger", url: urlActual, nota: "Redirección a login detectada. Ejecutando macro de login..." });
        
        // Ejecutar macro de login
        const resLogin = await ejecutarScript(macroLogin, { dirBase });
        
        // Exportar y guardar nueva sesión en caliente
        const expRes = await ejecutarScript([{ accion: "exportarPerfil" }], { dirBase });
        if (expRes[0] && expRes[0].state) {
          guardarAuth(dominio, expRes[0].state, dirBase);
        }

        // Reintentar acción original tras auto-login
        const resRetry = await ejecutarScript([accion], { dirBase });
        evidencia.push({ paso, accion: accion.accion, res: resRetry[0] || resRetry, healed: true });
      } else {
        evidencia.push({ paso, accion: accion.accion, res: itemRes });
      }
    }

    // Generar archivo de evidencia en Markdown
    const traceId = Math.random().toString(36).slice(2, 10);
    const rutaEvidencia = join(process.cwd(), ".fabrica", "evidencia", `qaonline_${traceId}.md`);
    mkdirSync(dirname(rutaEvidencia), { recursive: true });

    let md = `# Evidencia de QA en Vivo: ${flujo}\n\n`;
    md += `- **Dominio:** ${dominio}\n`;
    md += `- **Fecha:** ${new Date().toISOString()}\n`;
    md += `- **Pasos ejecutados:** ${evidencia.length}\n\n`;

    md += `## Resultados por Paso\n\n`;
    evidencia.forEach(e => {
      const icono = e.res?.ok !== false ? "✅" : "❌";
      md += `### Paso ${e.paso}: ${e.accion} ${icono}\n`;
      if (e.healed) md += `> 🩹 *Self-Healing Auth activado en este paso.*\n\n`;
      md += "```json\n" + JSON.stringify(e.res || e, null, 2) + "\n```\n\n";
    });

    writeFileSync(rutaEvidencia, md, "utf8");
    flushSyncEmergencia();

    return { ok: !evidencia.some(e => e.res?.ok === false), evidenciaPath: rutaEvidencia, pasos: evidencia.length };
  });

  return runner();
}

// Entrypoint CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let flujo = "QA CLI";
  let dominio = "localhost";
  let scriptRaw = "[]";
  let macroRaw = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--flujo") flujo = args[++i];
    if (args[i] === "--dominio") dominio = args[++i];
    if (args[i] === "--script") scriptRaw = args[++i];
    if (args[i] === "--macro-login") macroRaw = args[++i];
  }

  try {
    const script = JSON.parse(scriptRaw);
    const macroLogin = macroRaw ? JSON.parse(macroRaw) : null;
    ejecutarQAOnline({ flujo, dominio, script, macroLogin }).then(r => {
      console.log(JSON.stringify(r));
    }).catch(e => {
      console.error(JSON.stringify({ ok: false, error: e.message }));
      process.exit(1);
    });
  } catch (e) {
    console.error("Error parseando script JSON:", e.message);
    process.exit(1);
  }
}
