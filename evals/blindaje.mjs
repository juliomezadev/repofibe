#!/usr/bin/env node
// evals/blindaje.mjs — meta-evals: pruebas sobre las pruebas y sobre el cableado.
//
// Por qué existe. Los dos fallos graves encontrados el 2026-07-25 no eran
// bugs de lógica, eran el MISMO patrón:
//
//   1. `benchmark-gstack.mjs` publicaba cifras inventadas y corría dentro de
//      la suite. Como generar aleatorios nunca falla, esa "prueba" no podía
//      ponerse en rojo jamás. Un eval decorativo.
//   2. `guardia.mjs` y `sesion.mjs` llevaban versiones sin ejecutarse en una
//      instalación real, y `traza.mjs` llevaba dos versiones escrito sin que
//      lo llamara nadie. Código real, desconectado, sin nada que lo notara.
//
// El patrón común: **algo que se afirmaba funcionando, sin ningún mecanismo
// capaz de detectar que no.** Arreglar los dos casos concretos no impide el
// tercero. Esto vigila la clase entera:
//
//   A. Toda eval debe poder ponerse en rojo.
//   B. Ningún módulo del núcleo puede quedar huérfano (escrito y sin usar).
//   C. Toda referencia a un módulo desde una skill debe apuntar a algo real.
//   D. Todo hook declarado debe existir en disco.
//
// Es tier 1: gratis, sin red, corre con el resto.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fallos = [];
const fallo = (m) => fallos.push(m);
const ok = (m) => console.log(`  ok: ${m}`);

function archivosBajo(dir, ext = ".mjs") {
  if (!existsSync(dir)) return [];
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosBajo(p, ext));
    else if (e.name.endsWith(ext)) salida.push(p);
  }
  return salida;
}

const rel = (p) => p.replace(RAIZ, "").replaceAll("\\", "/").replace(/^\//, "");

// ── A. Toda eval debe poder ponerse en rojo ─────────────────────────────────
// Una eval que no puede fallar no verifica nada: da la sensación de cobertura
// sin darla. Es exactamente lo que hacía el benchmark fabricado.
{
  const evals = archivosBajo(join(RAIZ, "evals")).filter((p) => basename(p) !== "blindaje.mjs");
  const mudas = [];

  for (const p of evals) {
    const t = readFileSync(p, "utf8");
    // Cualquier salida distinta de exit(0) cuenta: `exit(1)`, pero también
    // `exit(fallos ? 1 : 0)` — la forma que usa el despachador de tier 2 y
    // que la primera versión de este guardia marcó como falso positivo por
    // buscar el literal `exit(1)`. Un detector demasiado estrecho acusa a
    // pruebas sanas, y eso erosiona la confianza en el guardia mismo.
    const puedeFallar =
      /process\.exit\(\s*(?!0\s*\))/.test(t) || // salida capaz de ser != 0
      /\bfallo\s*\(/.test(t) ||                 // colector de fallos del repo
      /node:assert/.test(t) ||                  // assert de Node
      /\bthrow\s+new\b/.test(t);                // excepción propia
    if (!puedeFallar) mudas.push(rel(p));
  }

  if (mudas.length) fallo(`evals que no pueden ponerse en rojo: ${mudas.join(", ")}. Una prueba que no puede fallar no prueba nada.`);
  else ok(`las ${evals.length} evals pueden ponerse en rojo (ninguna es decorativa)`);
}

// ── B. Ningún módulo del núcleo puede quedar huérfano ──────────────────────
// `traza.mjs` estuvo dos versiones escrito, probado y sin que lo llamara
// nadie: la telemetría "existía" y no registraba nada. Un módulo que no
// referencia ni una skill, ni un hook, ni otro módulo, ni una eval, o está
// muerto o está desconectado — ambas cosas hay que saberlas.
{
  const modulos = readdirSync(join(RAIZ, "nucleo")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));

  const fuentes = [
    ...archivosBajo(join(RAIZ, "nucleo")),
    ...archivosBajo(join(RAIZ, "hooks")),
    ...archivosBajo(join(RAIZ, "evals")),
    ...archivosBajo(join(RAIZ, "skills"), ".md"),
    ...archivosBajo(join(RAIZ, "plantillas"), ".md"),
    join(RAIZ, "README.md"),
  ].filter((p) => existsSync(p));

  const huerfanos = [];
  for (const m of modulos) {
    const patron = new RegExp(`\\b${m}\\.mjs\\b|nucleo/${m}\\b`);
    const referentes = fuentes.filter((p) => basename(p) !== `${m}.mjs` && patron.test(readFileSync(p, "utf8")));
    if (referentes.length === 0) huerfanos.push(m);
  }

  if (huerfanos.length) {
    fallo(`módulos del núcleo que no usa nadie: ${huerfanos.join(", ")}. O están muertos o están desconectados (el caso de traza.mjs).`);
  } else ok(`los ${modulos.length} módulos del núcleo están referenciados por alguien`);
}

// ── C. Toda referencia desde una skill debe apuntar a algo real ────────────
// Una skill que promete "corre sobre nucleo/x.mjs" y ese archivo no existe es
// una promesa que el usuario descubre fallando.
{
  const existentes = new Set(readdirSync(join(RAIZ, "nucleo")).filter((f) => f.endsWith(".mjs")));
  const rotas = [];

  for (const p of archivosBajo(join(RAIZ, "skills"), ".md")) {
    const t = readFileSync(p, "utf8");
    for (const m of t.matchAll(/nucleo\/([\w.-]+\.mjs)/g)) {
      if (!existentes.has(m[1])) rotas.push(`${rel(p)} → nucleo/${m[1]}`);
    }
  }

  if (rotas.length) fallo(`skills que apuntan a módulos inexistentes: ${[...new Set(rotas)].join(", ")}`);
  else ok("ninguna skill referencia un módulo del núcleo que no exista");
}

// ── D. Todo hook declarado debe existir en disco ───────────────────────────
// El manifiesto puede prometer un guardia que no está: el harness lo intenta,
// falla en silencio, y el usuario cree tener protección que no tiene.
{
  const manifiesto = join(RAIZ, "hooks", "hooks.json");
  if (!existsSync(manifiesto)) fallo("falta hooks/hooks.json");
  else {
    const t = readFileSync(manifiesto, "utf8");
    let cfg = null;
    try { cfg = JSON.parse(t); } catch (e) { fallo(`hooks.json no es JSON válido: ${e.message}`); }

    if (cfg) {
      const faltan = [];
      for (const archivo of t.matchAll(/hooks\/([\w.-]+\.mjs)/g)) {
        if (!existsSync(join(RAIZ, "hooks", archivo[1]))) faltan.push(archivo[1]);
      }
      if (faltan.length) fallo(`hooks.json declara hooks inexistentes: ${[...new Set(faltan)].join(", ")}`);

      // El matcher de PreToolUse debe cubrir Skill: sin eso las invocaciones
      // de skills son invisibles y la fábrica vuelve a no tener dato de uso.
      const matcher = cfg.hooks?.PreToolUse?.[0]?.matcher ?? "";
      if (!matcher.includes("Skill")) fallo(`el matcher de PreToolUse no cubre Skill ("${matcher}"): sin eso no hay dato de uso de skills`);

      if (!faltan.length && matcher.includes("Skill")) ok("los hooks declarados existen y el matcher cubre Skill");
    }
  }
}

// ── Veredicto ──────────────────────────────────────────────────────────────
if (fallos.length) {
  console.error(`\nFALLOS DE BLINDAJE (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: blindaje verificado (evals con dientes, sin módulos huérfanos, referencias y hooks reales)");
