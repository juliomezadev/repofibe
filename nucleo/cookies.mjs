#!/usr/bin/env node
// cookies.mjs: contexto autenticado para navegador.mjs, sin leer archivos cifrados
//
// Usa Playwright's storageState (exportar/importar cookies + localStorage entre
// sesiones) en vez de leer el almacén cifrado del navegador real (SQLite + DPAPI).
// Más seguro (solo el dominio que el usuario pide), más portable (cross-platform),
// más simple (cero deps extra). El usuario autentica UNA vez en Chromium visible,
// cookies.mjs guarda el storageState en .fabrica/auth/<dominio>.json, y
// navegador.mjs lo inyecta en las sesiones siguientes.
//
// Uso:
//   node <RAIZ>/nucleo/cookies.mjs guardar ejemplo.com
//     → abre Chromium visible, el usuario autentica, guarda storageState
//   node <RAIZ>/nucleo/cookies.mjs cargar ejemplo.com
//     → imprime JSON del storageState guardado (para pasar a navegador.mjs)
//   node <RAIZ>/nucleo/cookies.mjs listar
//     → lista dominios con storageState guardado
//   node <RAIZ>/nucleo/cookies.mjs retirar ejemplo.com
//     → elimina storageState del dominio
//
// También se puede importar como módulo:
//   import { guardar, cargar, listar, retirar, dirAuth } from "./cookies.mjs";

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = import.meta.dirname;
const DIR_AUTH = join(RAIZ, "..", ".fabrica", "auth");

function dirAuth(dirBase) {
  const d = dirBase ? join(dirBase, ".fabrica", "auth") : DIR_AUTH;
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function normalizarDominio(dominio) {
  return dominio
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")  // quita path completo (/path/sub → vacío)
    .toLowerCase();
}

function archivoAuth(dominio, dirBase) {
  return join(dirAuth(dirBase), `${normalizarDominio(dominio)}.json`);
}

async function playwright() {
  try { return await import("playwright"); }
  catch { throw new Error("Playwright no está instalado en este proyecto (repofibe es cero-deps) — instala con: npm install playwright && npx playwright install chromium"); }
}

async function guardar(dominio, dirBase) {
  const pw = await playwright();
  const norm = normalizarDominio(dominio);
  const archivo = archivoAuth(dominio, dirBase);
  const url = `https://${norm}`;

  // Abrir Chromium VISIBLE para que el usuario autentique manualmente
  const ctx = await pw.chromium.launchPersistentContext(
    join(dirAuth(dirBase), `perfil-${norm}`),
    { headless: false, viewport: { width: 1280, height: 720 } }
  );

  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log(`\nAutentica en ${url} y luego cierra la ventana del navegador.`);
  console.log("cookies.mjs guardará el storageState automáticamente al cerrar.\n");

  // Esperar hasta que el usuario cierre la ventana
  await new Promise((resolve) => {
    ctx.on("close", resolve);
    page.on("close", () => { if (ctx.pages().length === 0) resolve(); });
  });

  // Capturar storageState antes de cerrar (si no se cerró ya)
  let state;
  try { state = await ctx.storageState(); }
  catch { /* contexto ya cerrado — leer del perfil */ }
  finally { try { await ctx.close(); } catch { /* ya cerrado */ } }

  if (state) {
    writeFileSync(archivo, JSON.stringify(state, null, 2));
    const cookieCount = state.cookies.filter((c) => c.domain.includes(norm)).length;
    console.log(`storageState guardado para ${norm}: ${cookieCount} cookies, ${state.origins.length} origins → ${archivo}`);

    // Limpiar perfil temporal (el storageState ya está exportado)
    const perfilDir = join(dirAuth(dirBase), `perfil-${norm}`);
    if (existsSync(perfilDir)) rmSync(perfilDir, { recursive: true, force: true });
  } else {
    console.log("No se pudo capturar storageState — el navegador se cerró antes de poder leerlo.");
    console.log("Intenta de nuevo: autentica y THEN cierra la ventana.");
  }

  return state;
}

function cargar(dominio, dirBase) {
  const archivo = archivoAuth(dominio, dirBase);
  if (!existsSync(archivo)) return null;
  return JSON.parse(readFileSync(archivo, "utf-8"));
}

function listar(dirBase) {
  const d = dirAuth(dirBase);
  const archivos = readdirSync(d).filter((f) => f.endsWith(".json") && !f.startsWith("perfil"));
  return archivos.map((f) => f.replace(".json", ""));
}

function retirar(dominio, dirBase) {
  const archivo = archivoAuth(dominio, dirBase);
  if (!existsSync(archivo)) return false;
  rmSync(archivo);
  return true;
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accion, dominio] = process.argv.slice(2);
  const dirBase = process.env.REPOFIBE_DIR || undefined;

  if (accion === "guardar" && dominio) {
    await guardar(dominio, dirBase);
  } else if (accion === "cargar" && dominio) {
    const state = cargar(dominio, dirBase);
    if (state) console.log(JSON.stringify(state));
    else console.log(`No hay storageState guardado para ${normalizarDominio(dominio)}`);
  } else if (accion === "listar") {
    const dominios = listar(dirBase);
    if (dominios.length === 0) console.log("No hay dominios con storageState guardado.");
    else dominios.forEach((d) => console.log(`  ${d}`));
  } else if (accion === "retirar" && dominio) {
    const ok = retirar(dominio, dirBase);
    console.log(ok ? `storageState de ${normalizarDominio(dominio)} eliminado.` : `No hay storageState para ${normalizarDominio(dominio)}.`);
  } else {
    console.log("Uso: node cookies.mjs <guardar|cargar|listar|retirar> [dominio]");
    console.log("  guardar <dominio>  → abre Chromium visible, autentica y guarda storageState");
    console.log("  cargar <dominio>   → imprime JSON del storageState guardado");
    console.log("  listar             → lista dominios con storageState");
    console.log("  retirar <dominio>  → elimina storageState del dominio");
    process.exit(1);
  }
}

export { guardar, cargar, listar, retirar, dirAuth, normalizarDominio };