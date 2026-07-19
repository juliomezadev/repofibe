#!/usr/bin/env node
// salud.mjs — núcleo mecánico compartido de /desplegar y /canario.
// Lo que SÍ es determinista (detectar proveedor, medir una URL, comparar
// contra una línea base) vive aquí con evals reales. Lo que es juicio
// (¿mergeo?, ¿esta regresión amerita rollback?) se queda en las skills,
// donde corresponde — mecanizarlo sería fingir rigor que no existe.
//
// Uso:
//   node salud.mjs detectar [dir]                      # proveedor de deploy
//   node salud.mjs medir <url> [rutaSalud] [--json]     # una medición
//   node salud.mjs base <url> [rutaSalud]               # guarda línea base en .fabrica/salud-base.json
//   node salud.mjs comparar <url> [rutaSalud] [--json]  # mide y compara vs la base; exit 1 si hay regresión

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const RAIZ = process.cwd();
const BASE_ARCHIVO = join(RAIZ, ".fabrica", "salud-base.json");

// ── detección de proveedor ───────────────────────────────────────────────────
export function detectarProveedor(dir = RAIZ) {
  if (existsSync(join(dir, "vercel.json")) || existsSync(join(dir, ".vercel"))) return { proveedor: "vercel", evidencia: "vercel.json o .vercel/" };
  if (existsSync(join(dir, "netlify.toml"))) return { proveedor: "netlify", evidencia: "netlify.toml" };
  if (existsSync(join(dir, "fly.toml"))) return { proveedor: "fly", evidencia: "fly.toml" };
  const wf = join(dir, ".github", "workflows");
  if (existsSync(wf)) {
    for (const f of readdirSync(wf)) {
      if (!/\.ya?ml$/.test(f)) continue;
      let texto = "";
      try { texto = readFileSync(join(wf, f), "utf8"); } catch { continue; }
      if (/actions\/deploy-pages/.test(texto)) return { proveedor: "github-pages", evidencia: `.github/workflows/${f}` };
    }
  }
  return { proveedor: "manual", evidencia: "sin archivo de proveedor conocido" };
}

// ── medición de salud ─────────────────────────────────────────────────────────
const MAX_BYTES_HASH = 200_000; // no hashear páginas enormes completas

export async function medirSalud(url, rutaSalud = "", timeoutMs = 8000) {
  const destino = rutaSalud ? new URL(rutaSalud, url).href : url;
  const inicio = Date.now();
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resp = await fetch(destino, { signal: controlador.signal, redirect: "follow" });
    const buffer = await resp.arrayBuffer();
    const tiempoMs = Date.now() - inicio;
    const recorte = buffer.slice(0, MAX_BYTES_HASH);
    const hash = createHash("sha256").update(Buffer.from(recorte)).digest("hex").slice(0, 16);
    return { url: destino, ok: true, codigo: resp.status, tiempoMs, tamanoBytes: buffer.byteLength, hashContenido: hash, fecha: new Date().toISOString() };
  } catch (e) {
    return { url: destino, ok: false, error: e.name === "AbortError" ? "timeout" : e.message, fecha: new Date().toISOString() };
  } finally {
    clearTimeout(temporizador);
  }
}

// ── comparación contra línea base ────────────────────────────────────────────
// Pura y determinista: dadas dos mediciones, decide si hay señal de
// regresión. NO decide qué hacer al respecto — eso es de la skill.
//
// Nota honesta: un hash de contenido distinto NO es evidencia de regresión
// por sí solo — un deploy legítimo cambia el contenido todo el tiempo, y sin
// inspección semántica del body (que este módulo no hace) no hay forma
// confiable de distinguir "nuevo contenido válido" de "página de error
// servida con 200". Por eso `contenidoCambio` es solo informativo: nunca
// decide el estado. Tratarlo como señal de regresión produciría un falso
// positivo en cada deploy normal.
export function compararSalud(base, actual, umbralLatencia = 2) {
  const motivos = [];
  if (!actual.ok) { motivos.push(`la medición falló: ${actual.error}`); return { estado: "regresion", motivos, contenidoCambio: null }; }
  if (!base.ok) return { estado: "sin_base", motivos: ["la línea base no era válida — no hay con qué comparar"], contenidoCambio: null };

  const codigoEmpeoro = base.codigo < 400 && actual.codigo >= 400;
  if (codigoEmpeoro) motivos.push(`código HTTP pasó de ${base.codigo} a ${actual.codigo}`);

  const latenciaDegradada = base.tiempoMs > 0 && actual.tiempoMs > base.tiempoMs * umbralLatencia && actual.tiempoMs - base.tiempoMs > 200;
  if (latenciaDegradada) motivos.push(`latencia ${actual.tiempoMs}ms vs línea base ${base.tiempoMs}ms (>${umbralLatencia}x)`);

  const contenidoCambio = base.hashContenido !== actual.hashContenido;
  return { estado: motivos.length ? "regresion" : "estable", motivos, contenidoCambio };
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

// ── CLI (guardado: no se ejecuta si el módulo se importa) ───────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  const posicionales = args.filter((a) => a !== "--json");

  const main = async () => {
    switch (cmd) {
      case "detectar": {
        const r = detectarProveedor(posicionales[0] || RAIZ);
        if (json) console.log(JSON.stringify(r));
        else console.log(`Proveedor: ${r.proveedor} (${r.evidencia})`);
        break;
      }
      case "medir": {
        const [url, rutaSalud] = posicionales;
        if (!url) { console.error("Uso: medir <url> [rutaSalud]"); process.exit(1); }
        const r = await medirSalud(url, rutaSalud);
        if (json) { console.log(JSON.stringify(r)); break; }
        if (!r.ok) { console.log(`FALLO: ${r.url} — ${r.error}`); process.exit(1); }
        console.log(`${r.url} → ${r.codigo} en ${r.tiempoMs}ms (${r.tamanoBytes} bytes, hash ${r.hashContenido})`);
        break;
      }
      case "base": {
        const [url, rutaSalud] = posicionales;
        if (!url) { console.error("Uso: base <url> [rutaSalud]"); process.exit(1); }
        const r = await medirSalud(url, rutaSalud);
        if (!r.ok) { console.error(`No se pudo tomar línea base: ${r.error}`); process.exit(1); }
        guardarBase(r);
        console.log(`Línea base guardada: ${r.url} → ${r.codigo} en ${r.tiempoMs}ms.`);
        break;
      }
      case "comparar": {
        const [url, rutaSalud] = posicionales;
        const base = cargarBase();
        if (!base) { console.error("Sin línea base. Usa: node salud.mjs base <url> primero."); process.exit(1); }
        const actual = await medirSalud(url || base.url, rutaSalud);
        const veredicto = compararSalud(base, actual);
        if (json) { console.log(JSON.stringify({ base, actual, veredicto })); process.exit(veredicto.estado === "regresion" ? 1 : 0); }
        console.log(`Base: ${base.codigo} en ${base.tiempoMs}ms → Actual: ${actual.ok ? actual.codigo : "FALLO"} en ${actual.tiempoMs ?? "—"}ms`);
        console.log(`VEREDICTO: ${veredicto.estado.toUpperCase()}`);
        for (const m of veredicto.motivos) console.log(`  - ${m}`);
        process.exit(veredicto.estado === "regresion" ? 1 : 0);
      }
      default:
        console.error("Uso: detectar [dir] | medir <url> [rutaSalud] | base <url> [rutaSalud] | comparar <url> [rutaSalud]");
        process.exit(1);
    }
  };
  main();
}
