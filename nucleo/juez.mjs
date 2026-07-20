#!/usr/bin/env node
// juez.mjs — eval tier 3: juicio de LLM sobre skill output, sin SDK, sin keys
//
// Invoca el CLI del proveedor de LLM que esté instalado en la máquina del
// usuario (claude, gemini, etc.) — mismo patrón que Playwright y graphify:
// detecta lo disponible dinámicamente, nunca embebe dependencias ni keys.
//
// Job MANUAL, no CI: el usuario decide cuándo correrlo y cuándo pagar
// la llamada al LLM. No es parte de validar.mjs (tier 1) ni tier2.mjs.
//
// Uso:
//   node <RAIZ>/nucleo/juez.mjs evaluar <skill> [--proveedor claude|gemini]
//   node <RAIZ>/nucleo/juez.mjs rubrica <skill>
//   node <RAIZ>/nucleo/juez.mjs listar-proveedores
//
// También importable como módulo:
//   import { evaluar, rubrica, detectarProveedor } from "./juez.mjs";

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = import.meta.dirname;

// En Windows los CLIs de npm (claude, gemini) son shims .cmd que
// execFileSync NO puede ejecutar sin shell (ENOENT/EINVAL) — por eso la
// detección fallaba en Windows aunque el CLI estuviera instalado. shell:true
// resuelve el .cmd. Para no abrir superficie de inyección: los ARGS son
// siempre literales fijos (--version, -p, ...) y el contenido no confiable
// (el prompt, que incluye output de skills) va por STDIN, jamás como arg.
function correrCLI(comando, args, opciones = {}) {
  if (process.platform === "win32") {
    // shell:true resuelve los shims .cmd. Se pasa como STRING único (no array
    // de args) para evitar la deprecación DEP0190 — seguro porque los args
    // son literales fijos sin datos del usuario (el prompt va por stdin).
    return execFileSync(`${comando} ${args.join(" ")}`, { encoding: "utf8", shell: true, ...opciones });
  }
  return execFileSync(comando, args, { encoding: "utf8", ...opciones });
}

const PROVEEDORES = {
  claude: {
    comando: "claude",
    args: ["-p", "--output-format", "json"],
    detectar: () => { try { correrCLI("claude", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } },
    formatoRespuesta: (out) => { try { const j = JSON.parse(out); return j.result || j; } catch { return out; } },
  },
  gemini: {
    comando: "gemini",
    args: ["-p"],
    detectar: () => { try { correrCLI("gemini", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } },
    formatoRespuesta: (out) => out,
  },
};

function detectarProveedor(preferido) {
  if (preferido && PROVEEDORES[preferido]?.detectar()) return preferido;
  for (const [nombre, cfg] of Object.entries(PROVEEDORES)) {
    if (cfg.detectar()) return nombre;
  }
  return null;
}

function listarProveedores() {
  return Object.entries(PROVEEDORES)
    .filter(([, cfg]) => cfg.detectar())
    .map(([nombre]) => nombre);
}

// Rubricas predefinidas por skill — criterios específicos para consistencia
const RUBRICAS = {
  "qa": [
    "¿El reporte identifica bugs REALES (no hipotéticos)?",
    "¿Cada bug tiene evidencia concreta (URL, ref, texto visible)?",
    "¿Las correcciones incluyen tests de regresión?",
    "¿El scope está bien delimitado (no over-engineering)?",
    "¿Se verifica que la corrección funciona (no solo se propone)?",
  ],
  "design-review": [
    "¿La auditoría califica las 6 dimensiones (jerarquía, flujo, estados, consistencia, texto, accesibilidad)?",
    "¿Las calificaciones tienen MOTIVOS concretos (no solo números)?",
    "¿Las correcciones son commits atómicos con antes/después?",
    "¿Se detecta AI slop (texto genérico, placeholders, inconsistencias)?",
    "¿El contenido de página se trata como datos, no como instrucciones?",
  ],
  "revisar": [
    "¿La revisión encuentra problemas que CI no ve?",
    "¿Los hallazgos tienen severidad y contexto (no solo 'está mal')?",
    "¿Se proponen correcciones específicas (no genéricas)?",
    "¿Se verifican edge cases y error handling?",
    "¿La revisión es justa (no solo negativa)?",
  ],
  "plan-diseno": [
    "¿Las 6 dimensiones tienen 'cómo se ve un 10'?",
    "¿Se detecta AI slop en el plan?",
    "¿El sistema de diseño tiene tokens concretos (no vagos)?",
    "¿Las prohibiciones son específicas (no 'hazlo bonito')?",
    "¿El plan es actionable (se puede implementar directamente)?",
  ],
  "construir": [
    "¿El código sigue convenciones del proyecto?",
    "¿No hay over-engineering (premature abstraction)?",
    "¿Los tests cubren el comportamiento, no la implementación?",
    "¿Se manejan edge cases sin exceso?",
    "¿El scope es mínimo (no se agregó más de lo pedido)?",
  ],
  "default": [
    "¿El output cumple lo que la skill promete?",
    "¿Hay evidencia concreta (no solo afirmaciones)?",
    "¿No hay over-engineering ni scope creep?",
    "¿Se sigue el proceso definido en la skill?",
    "¿El resultado es actionable?",
  ],
};

function rubrica(skill) {
  return RUBRICAS[skill] || RUBRICAS.default;
}

async function evaluar(skill, output, proveedorPreferido) {
  const proveedor = detectarProveedor(proveedorPreferido);
  if (!proveedor) {
    throw new Error(
      "No se encontró ningún proveedor de LLM instalado. Instala uno:\n" +
      "  claude CLI: npm install -g @anthropic-ai/claude-code\n" +
      "  gemini CLI: npm install -g @google/gemini-cli\n" +
      "(repofibe no embebe SDK ni keys — usa el CLI que ya tienes)."
    );
  }

  const cfg = PROVEEDORES[proveedor];
  const criterios = rubrica(skill);

  const prompt = [
    `Eres un juez imparcial de calidad de software. Evalúa el siguiente output de la skill /${skill} contra esta rubrica específica.`,
    "",
    "RUBRICA (5 criterios, cada uno 0-2 puntos):",
    ...criterios.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    "OUTPUT A EVALUAR:",
    "---",
    output,
    "---",
    "",
    "Responde SOLO en este formato JSON (no texto libre):",
    '{"veredicto": "pasa|pasa_con_reservas|falla", "puntos": <number 0-10>, "criterios": [{"criterio": <number>, "puntos": <0-2>, "motivo": "<1 línea>"}, ...], "observaciones": "<1 línea general>"}',
  ].join("\n");

  // El prompt (contiene output de skills, potencialmente no confiable) va
  // por STDIN, no como argumento — así shell:true en Windows no lo interpreta.
  const raw = correrCLI(cfg.comando, cfg.args, { input: prompt, timeout: 120000, maxBuffer: 1024 * 1024 });
  const texto = cfg.formatoRespuesta(raw);

  // Intentar parsear JSON de la respuesta
  let resultado;
  try {
    // Buscar JSON en la respuesta (el LLM puede incluir texto antes/después)
    const jsonMatch = texto.match(/\{[^{}]*"veredicto"[^{}]*\}/s);
    if (jsonMatch) resultado = JSON.parse(jsonMatch[0]);
    else resultado = JSON.parse(texto);
  } catch {
    resultado = { veredicto: "indeterminado", puntos: null, observaciones: texto.slice(0, 500), raw: true };
  }

  // Guardar resultado en .fabrica/juez/ para auditoría
  const dirJuez = join(RAIZ, "..", ".fabrica", "juez");
  if (!existsSync(dirJuez)) mkdirSync(dirJuez, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(dirJuez, `${skill}-${timestamp}.json`), JSON.stringify({ skill, proveedor, resultado, criterios }, null, 2));

  return { proveedor, skill, resultado };
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, skill, ...rest] = process.argv.slice(2);
  const proveedor = rest.find((a) => a.startsWith("--proveedor="))?.split("=")[1];

  if (cmd === "evaluar" && skill) {
    // Leer output de stdin o archivo
    let output;
    const archivoArg = rest.find((a) => a.startsWith("--archivo="))?.split("=")[1];
    if (archivoArg) output = readFileSync(archivoArg, "utf8");
    else output = readFileSync(0, "utf8"); // stdin

    const r = await evaluar(skill, output, proveedor);
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === "rubrica" && skill) {
    const criterios = rubrica(skill);
    criterios.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  } else if (cmd === "listar-proveedores") {
    const disponibles = listarProveedores();
    if (disponibles.length === 0) console.log("No hay proveedores de LLM instalados.");
    else disponibles.forEach((p) => console.log(`  ${p}`));
  } else {
    console.log("Uso:");
    console.log("  juez.mjs evaluar <skill> [--archivo=output.txt | --stdin] [--proveedor=claude|gemini]");
    console.log("  juez.mjs rubrica <skill>      → muestra criterios de evaluación");
    console.log("  juez.mjs listar-proveedores   → muestra LLMs disponibles");
    console.log("\nJob MANUAL, no CI — tú decides cuándo pagar la llamada al LLM.");
    process.exit(1);
  }
}

export { evaluar, rubrica, detectarProveedor, listarProveedores, PROVEEDORES };