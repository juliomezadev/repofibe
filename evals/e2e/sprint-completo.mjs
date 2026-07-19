#!/usr/bin/env node
// evals/e2e/sprint-completo.mjs — evals tier 2: sesión real simulada.
//
// Tier 1 (validar.mjs) prueba cada nucleo/*.mjs AISLADO. Esto prueba la
// CADENA COMPLETA que un sprint real ejecuta: estado → construir (con
// checkpoints) → grafo → selección de pruebas → aplanar → shipear → retro,
// con el estado fluyendo de un paso al siguiente exactamente como lo haría
// una sesión real. Un cambio que rompe SOLO la integración (p.ej. el
// formato de sprint.json cambia de forma que /retro ya no puede leerlo)
// pasaría tier 1 sin que nada lo note — para eso existe tier 2.
//
// Sin LLM: las assertions son sobre archivos y estado, no sobre calidad de
// prosa (eso es tier 3, LLM-juez). Por eso corre gratis y determinista,
// pero es más lento que tier 1 — vive fuera de validar.mjs a propósito
// (la promesa de tier 1 es <5s; esto encadena ~15 subprocesos reales).
//
// Uso: node evals/e2e/sprint-completo.mjs

import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NUCLEO = join(RAIZ, "nucleo");

const tmp = mkdtempSync(join(tmpdir(), "repofibe-e2e-"));
const correr = (script, args) => {
  const r = spawnSync(process.execPath, [join(NUCLEO, script), ...args], { cwd: tmp, encoding: "utf8" });
  if (r.status !== 0 && !args.includes("--permitir-fallo")) {
    throw new Error(`${script} ${args.join(" ")} falló (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return r;
};
const git = (args) => spawnSync("git", ["-C", tmp, ...args], { encoding: "utf8" });

let pasos = 0;
const paso = (nombre) => { pasos++; console.log(`  [${pasos}] ${nombre}`); };

try {
  // ── Repo base con un módulo real (cadena de imports para grafo/pruebas) ──
  paso("Repo base con módulo de ejemplo");
  git(["init", "-q"]);
  git(["config", "user.name", "e2e"]);
  git(["config", "user.email", "e2e@repofibe"]);
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "core.js"), "export function nucleo() { return 1; }\n");
  writeFileSync(join(tmp, "src", "core.test.js"), "import { nucleo } from './core.js';\nconsole.log(nucleo());\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base del proyecto"]);
  const baseCommit = git(["rev-parse", "HEAD"]).stdout.trim();

  // ── Etapa PENSAR → PLANEAR ────────────────────────────────────────────────
  paso("estado.mjs iniciar (etapa: pensar)");
  let r = correr("estado.mjs", ["iniciar", "feature de ejemplo e2e"]);
  assert.match(r.stdout, /Sprint iniciado/);

  paso("estado.mjs etapa planear + plan");
  correr("estado.mjs", ["etapa", "planear"]);
  correr("estado.mjs", ["plan", "docs/fabrica/specs/e2e-spec.md"]);
  correr("memoria.mjs", ["agregar", "decision", "usar arquitectura simple para el modulo core"]);

  // ── Etapa CONSTRUIR con checkpoints continuos ─────────────────────────────
  paso("estado.mjs etapa construir + checkpoints WIP");
  correr("estado.mjs", ["etapa", "construir"]);
  writeFileSync(join(tmp, "src", "core.js"), "export function nucleo() { return 2; }\nexport function nueva() { return 3; }\n");
  correr("checkpoint.mjs", ["guardar", "avance parcial del modulo core"]);
  correr("estado.mjs", ["registrar", "construir", "1 función nueva, checkpoint guardado"]);

  // ── Etapa REVISAR: grafo + selección de pruebas afectadas ────────────────
  paso("grafo.mjs generar + impacto");
  r = correr("grafo.mjs", ["generar"]);
  assert.match(r.stdout, /Grafo generado/);
  r = correr("grafo.mjs", ["impacto", "src/core.js"]);
  assert.match(r.stdout, /src\/core\.test\.js/, "core.test.js importa core.js — debía aparecer en el radio de impacto");

  // NOTA (hallazgo real de este mismo test, ver PLAN-SUPERACION/CHANGELOG):
  // "afectadas" sin argumento compara el ÁRBOL DE TRABAJO — pero el
  // checkpoint del paso anterior ya commiteó core.js (checkpoint.mjs hace
  // `git add -A` antes de commitear). Con checkpoint continuo activo, hay
  // que comparar contra el commit BASE del sprint, no contra el árbol de
  // trabajo (que ya está limpio salvo archivos de estado sueltos).
  paso("pruebas.mjs afectadas (rango contra el commit base) detecta core.test.js");
  r = correr("pruebas.mjs", ["afectadas", baseCommit]);
  assert.match(r.stdout, /src\/core\.test\.js/, "el test del módulo tocado debía aparecer como afectado");
  correr("estado.mjs", ["etapa", "revisar"]);
  correr("estado.mjs", ["registrar", "revisar", "0 hallazgos, suite verde"]);

  // ── Etapa PROBAR → SHIPEAR: aplanar los WIP antes del "PR" ────────────────
  paso("estado.mjs etapa probar/shipear + checkpoint.mjs aplanar");
  correr("estado.mjs", ["etapa", "probar"]);
  correr("estado.mjs", ["registrar", "qa", "1 flujo verificado"]);
  correr("estado.mjs", ["etapa", "shipear"]);
  r = correr("checkpoint.mjs", ["aplanar", "feature de ejemplo e2e completa"]);
  assert.match(r.stdout, /Aplanados 1/);
  const titulos = git(["log", "--pretty=%s"]).stdout.trim().split("\n");
  assert.equal(titulos[0], "feature de ejemplo e2e completa", "el aplanado debía dejar el commit final al tope");
  assert.ok(!titulos.some((t) => t.startsWith("WIP:")), "no debía quedar ningún WIP suelto tras aplanar");
  correr("estado.mjs", ["registrar", "shipear", "PR simulado, suite verde"]);

  // ── Etapa RETRO: cierre y verificación de integridad del historial ───────
  paso("estado.mjs etapa retro + verificación del historial completo");
  correr("estado.mjs", ["etapa", "retro"]);
  correr("memoria.mjs", ["agregar", "aprendizaje", "el flujo e2e completo funciono sin fricción"]);

  const sprint = JSON.parse(readFileSync(join(tmp, ".fabrica", "sprint.json"), "utf8"));
  assert.equal(sprint.objetivo, "feature de ejemplo e2e");
  assert.equal(sprint.etapa, "retro");
  const skillsRegistradas = sprint.historial.map((h) => h.skill);
  for (const esperado of ["construir", "revisar", "qa", "shipear"]) {
    assert.ok(skillsRegistradas.includes(esperado), `el historial del sprint debía incluir un registro de "${esperado}", tiene: ${skillsRegistradas.join(", ")}`);
  }

  const memoria = readFileSync(join(tmp, ".fabrica", "memoria.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(memoria.length, 2, "debían quedar 2 entradas de memoria (decisión + aprendizaje)");
  assert.ok(memoria.some((m) => m.tipo === "decision"));
  assert.ok(memoria.some((m) => m.tipo === "aprendizaje"));

  r = correr("memoria.mjs", ["buscar", "modulo core"]);
  assert.match(r.stdout, /arquitectura simple/, "la búsqueda debía encontrar la decisión registrada durante el sprint");

  console.log(`\nTier 2: sprint completo (${pasos} pasos, pensar→retro) ejecutado con integridad de estado, memoria e historial de git verificada.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
