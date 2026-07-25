#!/usr/bin/env node
// evals/e2e/skills-criticas.mjs — tier 2: valida 5 skills críticas end-to-end
// contra casos de prueba reales y pequeños, con un juez LLM de veredicto
// binario sobre Opus 5. Se recoge automáticamente por evals/tier2.mjs (que corre cada
// archivo de evals/e2e/), así que "node evals/tier2.mjs" ya la ejecuta.
//
// Diferencia con lo que ya existe:
//   - validar.mjs (tier 1)   → estructura/lint, gratis, <5s, sin red.
//   - sprint-completo.mjs (tier 2) → cadena real de nucleo/*.mjs, sin LLM.
//   - nucleo/juez.mjs (tier 3) → rúbrica de 5 criterios vía CLI instalado
//     (claude/gemini), pensado para juicio profundo de un output ya escrito.
//   - ESTA eval → invoca la skill misma (system prompt = SKILL.md real) con
//     un input de una línea y deja que un juez binario (sí/no + 1 línea)
//     diga si "sigue funcionando" — un smoke test, no una revisión de fondo.
//
// Por qué llamar a /v1/messages directo (fetch nativo) en vez de reusar el
// CLI `claude` de nucleo/juez.mjs: se probó en vivo — "¿cuánto es 2+2?" vía
// `claude -p --model haiku --system-prompt "..."` costó $0.05 y generó
// ~40K tokens de cache-creation, porque el CLI arrastra el harness completo
// de Claude Code (system prompt propio, memoria, MCP, etc.) sin importar
// los flags. Eso es lo opuesto a "minimalista". Una llamada directa a la
// API con SOLO el SKILL.md como system prompt cuesta una fracción de eso.
//
// Costo real, por diseño: requiere ANTHROPIC_API_KEY. Sin ella, se omite
// con salida clara y exit 0 — mismo criterio que nucleo/juez.mjs ("job
// manual con costo, omitido de CI por diseño"). Con la key puesta, corre
// de verdad contra las 5 skills y reporta X/5.
//
// Uso: ANTHROPIC_API_KEY=sk-... node evals/e2e/skills-criticas.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Opus 5 tanto para el ACTOR (la skill bajo prueba) como para el JUEZ.
// Decisión deliberada: la eval debe medir la skill como se ejecuta de verdad,
// con el modelo más capaz — un juez débil aprueba respuestas mediocres y una
// eval que miente es peor que no tener eval. El precio de eso es que esta
// suite cuesta más por corrida; por eso es job manual con key, no CI.
const MODELO = "claude-opus-5";
const API_URL = "https://api.anthropic.com/v1/messages";

// ── Casos de prueba: 1 por skill crítica, deliberadamente pequeños ──────────
const CASOS = [
  {
    skill: "legal",
    input: "¿Cómo termino un contrato de trabajo a término indefinido en Colombia sin justa causa?",
    esperado: "menciona el Código Sustantivo del Trabajo (CST), indemnización o preaviso — no inventa cifras sin antes pedir los hechos concretos",
  },
  {
    skill: "qa",
    input: "Prueba https://example.com y dime si el título de la página carga bien.",
    esperado: "describe un plan de prueba con navegador real (navegar, snapshot, refs) — no inventa un resultado sin haber navegado",
  },
  {
    skill: "shipear",
    input: "¿Está lista la rama actual para hacer deploy?",
    esperado: "describe un checklist de release (suite verde, cobertura, versión, changelog, PR) — no un 'sí' sin verificar nada",
  },
  {
    skill: "revisar",
    input: [
      "Audita este código:",
      "```js",
      "function dividir(a, b) { return a / b; }",
      "```",
    ].join("\n"),
    esperado: "señala el riesgo real (división por cero / falta de validación de b) — no un comentario genérico sin sustancia",
  },
  {
    skill: "construir",
    input: "Escribe una función que sume dos números.",
    esperado: "genera código real (function/const con una suma) — no solo una descripción sin código",
  },
];

// ── Cliente HTTP directo a la API de Anthropic (fetch nativo, sin SDK) ──────
async function llamarClaude(apiKey, { system, prompt, maxTokens }) {
  const respuesta = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => "");
    throw new Error(`API Anthropic respondió ${respuesta.status}: ${texto.slice(0, 300)}`);
  }

  const json = await respuesta.json();
  const bloqueTexto = json.content?.find((b) => b.type === "text");
  if (!bloqueTexto) throw new Error(`respuesta sin bloque de texto: ${JSON.stringify(json).slice(0, 300)}`);
  return bloqueTexto.text;
}

// ── Juez minimalista: solo sí/no + 1 línea de feedback si falla ─────────────
async function juzgar(apiKey, caso, respuestaSkill) {
  const promptJuez = [
    `Skill: /${caso.skill}`,
    `Input del usuario: ${caso.input}`,
    `Qué se espera de una buena respuesta: ${caso.esperado}`,
    "Respuesta de la skill:",
    "---",
    respuestaSkill,
    "---",
    "",
    '¿La skill respondió bien al input? Responde SOLO JSON: {"ok": true/false, "feedback": "1 línea si falló"}',
  ].join("\n");

  const texto = await llamarClaude(apiKey, {
    system:
      "Eres un juez minimalista de calidad de software. No hagas análisis profundo — un veredicto rápido y, si falla, una sola línea de feedback. Responde SOLO con el JSON pedido, sin texto adicional ni explicación.",
    prompt: promptJuez,
    maxTokens: 150,
  });

  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, feedback: `juez no devolvió JSON: ${texto.slice(0, 150)}` };
  try {
    const parsed = JSON.parse(match[0]);
    return { ok: Boolean(parsed.ok), feedback: typeof parsed.feedback === "string" ? parsed.feedback : "" };
  } catch {
    return { ok: false, feedback: `juez devolvió JSON inválido: ${texto.slice(0, 150)}` };
  }
}

// ── Ejecuta un caso: lee el SKILL.md real → simula la skill → juzga ─────────
async function ejecutarCaso(apiKey, caso) {
  const rutaSkill = join(RAIZ, "skills", caso.skill, "SKILL.md");
  if (!existsSync(rutaSkill)) {
    return { skill: caso.skill, ok: false, feedback: `falta skills/${caso.skill}/SKILL.md` };
  }
  const skillMd = readFileSync(rutaSkill, "utf8");

  let respuestaSkill;
  try {
    respuestaSkill = await llamarClaude(apiKey, { system: skillMd, prompt: caso.input, maxTokens: 400 });
  } catch (e) {
    return { skill: caso.skill, ok: false, feedback: `error invocando la skill: ${e.message}` };
  }

  try {
    const veredicto = await juzgar(apiKey, caso, respuestaSkill);
    return { skill: caso.skill, ...veredicto };
  } catch (e) {
    return { skill: caso.skill, ok: false, feedback: `error invocando el juez: ${e.message}` };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("Tier 2 (skills críticas + juez LLM): omitido — falta ANTHROPIC_API_KEY.");
    console.log("Job manual con costo, por diseño (mismo criterio que nucleo/juez.mjs).");
    console.log("Para correrlo: ANTHROPIC_API_KEY=sk-... node evals/e2e/skills-criticas.mjs");
    console.log("0/5 (omitido)");
    process.exit(0);
  }

  console.log(`Evaluando ${CASOS.length} skills críticas con juez ${MODELO} (en paralelo)...\n`);

  // Las 5 skills se prueban en paralelo (actor + juez son secuenciales
  // *dentro* de cada skill, pero las skills entre sí no dependen una de
  // otra) — mantiene esto rápido y evita el timeout de 60s que
  // evals/tier2.mjs aplica a cada suite.
  const resultados = await Promise.all(CASOS.map((caso) => ejecutarCaso(apiKey, caso)));

  for (const r of resultados) {
    console.log(`  /${r.skill} ... ${r.ok ? "OK" : `FALLA — ${r.feedback}`}`);
  }

  const pasaron = resultados.filter((r) => r.ok).length;
  console.log(`\n${pasaron}/${CASOS.length} skills pasaron el juez LLM.`);

  const fallidas = resultados.filter((r) => !r.ok);
  if (fallidas.length) {
    console.log("\nDetalle de fallas:");
    for (const f of fallidas) console.log(`  ✗ /${f.skill}: ${f.feedback}`);
  }

  process.exit(pasaron === CASOS.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`Tier 2 skills críticas: error inesperado — ${e.stack || e.message}`);
  process.exit(1);
});
