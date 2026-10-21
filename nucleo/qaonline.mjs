#!/usr/bin/env node
// qaonline.mjs - Orquestador de QA en Vivo con Self-Healing Auth y evidencia.

import { crearSesionNavegador } from "./navegador.mjs";
import { guardarEstado as guardarAuth, cargar as cargarAuth } from "./cookies.mjs";
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
  dirBase = undefined,
} = {}) {
  const runner = withTrace(`qaonline: ${flujo}`, async () => {
    const evidencia = [];
    const accionesOriginales = [...script];

    // Solo cargar un perfil si existe. La auto-curación también debe funcionar
    // cuando el primer acceso aún no tiene credenciales guardadas.
    if (dominio && !accionesOriginales.some((a) => a.accion === "perfil")) {
      const hayPerfil = (() => {
        try { return Boolean(cargarAuth(dominio, dirBase)); } catch { return false; }
      })();
      if (hayPerfil) {
        accionesOriginales.unshift({ accion: "perfil", dominio });
      } else {
        evidencia.push({
          paso: 0,
          accion: "perfil",
          omitido: true,
          nota: `Sin sesión guardada para ${dominio}: se continúa sin perfil. ` +
            "Si el sitio redirige al login y hay macroLogin, la auto-curación se encarga.",
        });
      }
    }

    // Una única sesión es el límite de aislamiento de esta corrida: conserva
    // cookies, localStorage, refs y la page, y siempre se cierra en finally.
    const session = await crearSesionNavegador({ dirBase, accionesIniciales: accionesOriginales });
    try {
      let paso = 0;
      for (const accion of accionesOriginales) {
        paso++;
        const itemRes = await session.ejecutar(accion);
        if (!itemRes || itemRes.ok === false) {
          throw new Error(itemRes?.error || `La acción ${accion.accion} falló`);
        }

        const urlActual = itemRes.url || "";
        const esLogin = patronLogin.some((pat) => urlActual.includes(pat));
        if (esLogin && macroLogin && accion.accion !== "perfil") {
          evidencia.push({
            paso,
            accion: "self-healing-trigger",
            url: urlActual,
            nota: "Redirección a login detectada. Ejecutando macro de login...",
          });

          for (const loginAccion of macroLogin) {
            const loginRes = await session.ejecutar(loginAccion);
            if (!loginRes || loginRes.ok === false) {
              throw new Error(loginRes?.error || `La acción de login ${loginAccion.accion} falló`);
            }
          }

          const expRes = await session.ejecutar({ accion: "exportarPerfil" });
          if (expRes?.state) guardarAuth(dominio, expRes.state, dirBase);

          const retry = await session.ejecutar(accion);
          if (!retry || retry.ok === false) {
            throw new Error(retry?.error || `La acción ${accion.accion} falló después del login`);
          }
          evidencia.push({ paso, accion: accion.accion, res: retry, healed: true });
        } else {
          evidencia.push({ paso, accion: accion.accion, res: itemRes });
        }
      }
    } finally {
      await session.cerrar();
    }

    const traceId = Math.random().toString(36).slice(2, 10);
    const rutaEvidencia = join(process.cwd(), ".fabrica", "evidencia", `qaonline_${traceId}.md`);
    mkdirSync(dirname(rutaEvidencia), { recursive: true });
    let md = `# Evidencia de QA en Vivo: ${flujo}\n\n`;
    md += `- **Dominio:** ${dominio}\n`;
    md += `- **Fecha:** ${new Date().toISOString()}\n`;
    md += `- **Pasos ejecutados:** ${evidencia.length}\n\n`;
    md += "## Resultados por Paso\n\n";
    evidencia.forEach((e) => {
      const icono = e.res?.ok !== false ? "✅" : "❌";
      md += `### Paso ${e.paso}: ${e.accion} ${icono}\n`;
      if (e.healed) md += "> 🩹 *Self-Healing Auth activado en este paso.*\n\n";
      md += "```json\n" + JSON.stringify(e.res || e, null, 2) + "\n```\n\n";
    });
    writeFileSync(rutaEvidencia, md, "utf8");
    flushSyncEmergencia();
    return { ok: true, evidenciaPath: rutaEvidencia, pasos: evidencia.length };
  });

  return runner();
}

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
    ejecutarQAOnline({ flujo, dominio, script, macroLogin })
      .then((r) => console.log(JSON.stringify(r)))
      .catch((e) => { console.error(JSON.stringify({ ok: false, error: e.message })); process.exit(1); });
  } catch (e) {
    console.error("Error parseando script JSON:", e.message);
    process.exit(1);
  }
}
