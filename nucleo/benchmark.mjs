#!/usr/bin/env node
// benchmark.mjs — Core Web Vitals reales, sobre Chromium real.
//
// Igual que navegador.mjs y salud.mjs: Playwright NO es dependencia de
// repofibe (se importa dinámicamente; si falta, el error explica cómo
// instalarlo). No reusa el formato de "script de acciones" de
// navegador.mjs porque medir LCP/CLS exige inyectar un observer ANTES de
// navegar (addInitScript) — un paso que ese formato no modela — así que
// vive como módulo propio, con la misma forma de CLI que salud.mjs
// (medir/base/comparar) por consistencia.
//
// Uso:
//   node benchmark.mjs medir <url> [--json]
//   node benchmark.mjs base <url>              # guarda línea base en .fabrica/benchmark-base.json
//   node benchmark.mjs comparar <url> [--json]  # mide y compara vs la base; exit 1 si hay regresión

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = process.cwd();
const BASE_ARCHIVO = join(RAIZ, ".fabrica", "benchmark-base.json");

async function cargarPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright no está instalado en este proyecto. Instálalo con:\n" +
      "  npm install playwright && npx playwright install chromium\n" +
      "(repofibe no lo empaqueta — sigue siendo cero-dependencias)."
    );
  }
}

// Script inyectado ANTES de navegar: observa LCP (se actualiza hasta que el
// usuario interactúa o la página termina de cargar) y CLS (acumulado,
// ignora shifts durante los primeros 500ms tras un input reciente — misma
// regla que usa web-vitals de Google) en window.__repofibeVitales.
const SCRIPT_OBSERVADOR = `
  window.__repofibeVitales = { lcp: null, cls: 0 };
  try {
    new PerformanceObserver((lista) => {
      const entradas = lista.getEntries();
      const ultima = entradas[entradas.length - 1];
      if (ultima) window.__repofibeVitales.lcp = ultima.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) {
        if (!entrada.hadRecentInput) window.__repofibeVitales.cls += entrada.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) { window.__repofibeVitales.error = String(e); }
`;

export async function medirVitales(url, { headless = true, esperaMs = 1500, timeoutMs = 20000 } = {}) {
  const { chromium } = await cargarPlaywright();
  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.addInitScript(SCRIPT_OBSERVADOR);
    const inicio = Date.now();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(esperaMs); // deja que LCP/CLS se asienten
    const tiempoTotalMs = Date.now() - inicio;

    const datos = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] ?? {};
      const recursos = performance.getEntriesByType("resource");
      return {
        vitales: window.__repofibeVitales,
        ttfbMs: nav.responseStart ?? null,
        domContentLoadedMs: nav.domContentLoadedEventEnd ?? null,
        loadMs: nav.loadEventEnd ?? null,
        recursos: recursos.length,
        bytesTransferidos: recursos.reduce((s, r) => s + (r.transferSize || 0), 0),
      };
    });

    return {
      url, ok: true, fecha: new Date().toISOString(), tiempoTotalMs,
      lcpMs: datos.vitales?.lcp ?? null,
      cls: datos.vitales?.cls ?? null,
      ttfbMs: datos.ttfbMs, domContentLoadedMs: datos.domContentLoadedMs, loadMs: datos.loadMs,
      recursos: datos.recursos, bytesTransferidos: datos.bytesTransferidos,
    };
  } catch (e) {
    return { url, ok: false, error: e.message, fecha: new Date().toISOString() };
  } finally {
    await browser.close();
  }
}

// Pura y determinista, igual que compararSalud: umbrales absolutos +
// relativos para evitar ruido de red en una sola medición. LCP y CLS son
// las señales primarias (son las que Google usa para "buena experiencia");
// bytesTransferidos es informativo, nunca decide el estado por sí solo
// (un asset que creció puede ser una imagen mejor, no una regresión).
export function compararVitales(base, actual, umbralRelativo = 1.25) {
  const motivos = [];
  if (!actual.ok) { motivos.push(`la medición falló: ${actual.error}`); return { estado: "regresion", motivos }; }
  if (!base.ok) return { estado: "sin_base", motivos: ["la línea base no era válida — no hay con qué comparar"] };

  if (base.lcpMs != null && actual.lcpMs != null) {
    const degradado = actual.lcpMs > base.lcpMs * umbralRelativo && actual.lcpMs - base.lcpMs > 300;
    if (degradado) motivos.push(`LCP ${Math.round(actual.lcpMs)}ms vs línea base ${Math.round(base.lcpMs)}ms (>${umbralRelativo}x)`);
  }
  if (base.cls != null && actual.cls != null) {
    const degradado = actual.cls - base.cls > 0.1 && actual.cls > 0.1; // 0.1 = umbral "necesita mejora" de Google
    if (degradado) motivos.push(`CLS ${actual.cls.toFixed(3)} vs línea base ${base.cls.toFixed(3)}`);
  }
  if (base.ttfbMs != null && actual.ttfbMs != null) {
    const degradado = actual.ttfbMs > base.ttfbMs * umbralRelativo && actual.ttfbMs - base.ttfbMs > 200;
    if (degradado) motivos.push(`TTFB ${Math.round(actual.ttfbMs)}ms vs línea base ${Math.round(base.ttfbMs)}ms (>${umbralRelativo}x)`);
  }

  return { estado: motivos.length ? "regresion" : "estable", motivos };
}

function guardarBase(medicion) {
  mkdirSync(dirname(BASE_ARCHIVO), { recursive: true });
  const tmp = BASE_ARCHIVO + ".tmp";
  writeFileSync(tmp, JSON.stringify(medicion, null, 2) + "\n", "utf8");
  renameSync(tmp, BASE_ARCHIVO);
}
function cargarBase() {
  try { return JSON.parse(readFileSync(BASE_ARCHIVO, "utf8")); } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  const [url] = args.filter((a) => a !== "--json");

  const main = async () => {
    switch (cmd) {
      case "medir": {
        if (!url) { console.error("Uso: medir <url> [--json]"); process.exit(1); }
        const r = await medirVitales(url);
        if (json) { console.log(JSON.stringify(r)); break; }
        if (!r.ok) { console.log(`FALLO: ${r.url} — ${r.error}`); process.exit(1); }
        console.log(`${r.url}\n  LCP: ${r.lcpMs != null ? Math.round(r.lcpMs) + "ms" : "—"} · CLS: ${r.cls != null ? r.cls.toFixed(3) : "—"} · TTFB: ${r.ttfbMs != null ? Math.round(r.ttfbMs) + "ms" : "—"}\n  ${r.recursos} recursos, ${(r.bytesTransferidos / 1024).toFixed(1)}KB transferidos`);
        break;
      }
      case "base": {
        if (!url) { console.error("Uso: base <url>"); process.exit(1); }
        const r = await medirVitales(url);
        if (!r.ok) { console.error(`No se pudo tomar línea base: ${r.error}`); process.exit(1); }
        guardarBase(r);
        console.log(`Línea base guardada: LCP ${Math.round(r.lcpMs ?? 0)}ms, CLS ${(r.cls ?? 0).toFixed(3)}.`);
        break;
      }
      case "comparar": {
        const base = cargarBase();
        if (!base) { console.error("Sin línea base. Usa: node benchmark.mjs base <url> primero."); process.exit(1); }
        const actual = await medirVitales(url || base.url);
        const veredicto = compararVitales(base, actual);
        if (json) { console.log(JSON.stringify({ base, actual, veredicto })); process.exit(veredicto.estado === "regresion" ? 1 : 0); }
        console.log(`VEREDICTO: ${veredicto.estado.toUpperCase()}`);
        for (const m of veredicto.motivos) console.log(`  - ${m}`);
        process.exit(veredicto.estado === "regresion" ? 1 : 0);
      }
      default:
        console.error("Uso: medir <url> [--json] | base <url> | comparar <url> [--json]");
        process.exit(1);
    }
  };
  main();
}
