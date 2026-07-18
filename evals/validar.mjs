#!/usr/bin/env node
// validar.mjs — evals tier 1 de repofibe: gratis, <5s, sin red.
// Valida estructura (skills, manifiestos, hooks) Y comportamiento real
// (estado, memoria y guardia se ejecutan de verdad contra un dir temporal).
// Salida: lista de fallos; exit 1 si hay alguno. Pensado para CI y pre-commit.

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fallos = [];
const fallo = (msg) => fallos.push(msg);
const ok = (msg) => console.log(`  ok: ${msg}`);

// ── 1. Skills: frontmatter, convenciones, referencias ────────────────────────
const dirSkills = join(RAIZ, "skills");
const skills = readdirSync(dirSkills, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
if (skills.length < 10) fallo(`se esperaban 10+ skills, hay ${skills.length}`);

for (const s of skills) {
  const ruta = join(dirSkills, s, "SKILL.md");
  if (!existsSync(ruta)) { fallo(`${s}: falta SKILL.md`); continue; }
  const texto = readFileSync(ruta, "utf8");

  const fm = texto.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { fallo(`${s}: sin frontmatter`); continue; }
  const nombre = fm[1].match(/^name:\s*(\S+)/m)?.[1];
  if (nombre !== s) fallo(`${s}: name del frontmatter ("${nombre}") no coincide con el directorio`);
  if (!/^description:/m.test(fm[1])) fallo(`${s}: sin description`);
  if (!/Úsala cuando/.test(fm[1])) fallo(`${s}: la description no trae disparadores ("Úsala cuando...")`);
  if (!/\(repofibe\)/.test(fm[1])) fallo(`${s}: la description no termina con "(repofibe)"`);

  if (!/Arranque obligatorio/.test(texto)) fallo(`${s}: falta el bloque "Arranque obligatorio"`);
  if (texto.length > 12000) fallo(`${s}: SKILL.md pesa ${texto.length} chars (>12000 — límite de workflows Antigravity y de cortesía de contexto)`);

  // Toda referencia a plantillas/ o nucleo/ debe apuntar a un archivo real.
  for (const m of texto.matchAll(/(plantillas|nucleo)\/([a-z-]+\.(?:md|mjs))/g)) {
    if (!existsSync(join(RAIZ, m[1], m[2]))) fallo(`${s}: referencia rota → ${m[1]}/${m[2]}`);
  }
}
if (!fallos.length) ok(`${skills.length} skills con frontmatter, disparadores y referencias válidas`);

// ── 2. Manifiestos y versión ─────────────────────────────────────────────────
try {
  const plugin = JSON.parse(readFileSync(join(RAIZ, ".claude-plugin", "plugin.json"), "utf8"));
  const version = readFileSync(join(RAIZ, "VERSION"), "utf8").trim();
  if (plugin.version !== version) fallo(`VERSION (${version}) != plugin.json (${plugin.version})`);
  JSON.parse(readFileSync(join(RAIZ, ".claude-plugin", "marketplace.json"), "utf8"));
  ok(`manifiestos válidos, versión ${version}`);
} catch (e) { fallo(`manifiestos: ${e.message}`); }

// ── 3. Hooks: JSON válido y scripts existentes ───────────────────────────────
try {
  const hooks = JSON.parse(readFileSync(join(RAIZ, "hooks", "hooks.json"), "utf8"));
  const comandos = JSON.stringify(hooks);
  for (const m of comandos.matchAll(/hooks\/([a-z-]+\.mjs)/g)) {
    if (!existsSync(join(RAIZ, "hooks", m[1]))) fallo(`hooks.json referencia hooks/${m[1]} y no existe`);
  }
  ok("hooks.json válido y scripts presentes");
} catch (e) { fallo(`hooks.json: ${e.message}`); }

// ── 4. Sintaxis de todos los .mjs ────────────────────────────────────────────
for (const dir of ["nucleo", "hooks", "evals"]) {
  for (const f of readdirSync(join(RAIZ, dir)).filter((f) => f.endsWith(".mjs"))) {
    const r = spawnSync(process.execPath, ["--check", join(RAIZ, dir, f)], { encoding: "utf8" });
    if (r.status !== 0) fallo(`${dir}/${f}: error de sintaxis → ${r.stderr.trim().split("\n")[0]}`);
  }
}
if (!fallos.some((f) => f.includes("sintaxis"))) ok("sintaxis de todos los .mjs");

// ── 5. Funcional: estado.mjs y memoria.mjs contra un dir temporal ────────────
const tmp = mkdtempSync(join(tmpdir(), "repofibe-eval-"));
const correr = (script, args) =>
  spawnSync(process.execPath, [join(RAIZ, "nucleo", script), ...args], { cwd: tmp, encoding: "utf8" });
try {
  let r = correr("estado.mjs", ["iniciar", "sprint de prueba"]);
  if (!/Sprint iniciado/.test(r.stdout)) fallo(`estado.mjs iniciar: salida inesperada → ${r.stdout || r.stderr}`);
  r = correr("estado.mjs", ["registrar", "eval", "paso de prueba"]);
  if (!/Registrado/.test(r.stdout)) fallo(`estado.mjs registrar: ${r.stdout || r.stderr}`);
  r = correr("estado.mjs", ["ver"]);
  if (!/sprint de prueba/.test(r.stdout) || !/paso de prueba/.test(r.stdout)) fallo(`estado.mjs ver no refleja lo escrito`);

  r = correr("memoria.mjs", ["agregar", "aprendizaje", "la validación funciona"]);
  if (!/Memoria guardada/.test(r.stdout)) fallo(`memoria.mjs agregar: ${r.stdout || r.stderr}`);
  r = correr("memoria.mjs", ["buscar", "validacion"]); // sin tilde: prueba normalización de acentos
  if (!/validación funciona/.test(r.stdout)) fallo(`memoria.mjs buscar no encontró (¿normalización de acentos rota?): ${r.stdout}`);
  if (!fallos.some((f) => f.startsWith("estado") || f.startsWith("memoria"))) ok("estado.mjs y memoria.mjs funcionan (incluida búsqueda sin tildes)");
} finally { /* tmp se limpia al final */ }

// ── 6. Funcional: guardia.mjs (protocolo de hook real por stdin) ─────────────
function probarGuardia(entrada) {
  const r = spawnSync(process.execPath, [join(RAIZ, "hooks", "guardia.mjs")], {
    cwd: tmp, input: JSON.stringify(entrada), encoding: "utf8",
  });
  try { return JSON.parse(r.stdout).hookSpecificOutput; } catch { return null; }
}
let g = probarGuardia({ tool_name: "Bash", tool_input: { command: "rm -rf /" }, cwd: tmp });
if (g?.permissionDecision !== "ask") fallo(`guardia: "rm -rf /" debió dar "ask", dio ${JSON.stringify(g)}`);
g = probarGuardia({ tool_name: "Bash", tool_input: { command: "git push --force-with-lease origin main" }, cwd: tmp });
if (g !== null) fallo(`guardia: --force-with-lease es seguro y no debía alertar, dio ${JSON.stringify(g)}`);
g = probarGuardia({ tool_name: "Bash", tool_input: { command: "ls -la" }, cwd: tmp });
if (g !== null) fallo(`guardia: "ls -la" no debía alertar`);
g = probarGuardia({ tool_name: "PowerShell", tool_input: { command: "Remove-Item C:\\datos -Recurse -Force" }, cwd: tmp });
if (g?.permissionDecision !== "ask") fallo(`guardia: Remove-Item -Recurse -Force debió dar "ask"`);
// Congelamiento: edición fuera del directorio → deny.
correr("estado.mjs", ["ver"]); // asegura .fabrica
execFileSync(process.execPath, ["-e", `require('fs').writeFileSync(require('path').join(process.argv[1],'.fabrica','congelar.json'), JSON.stringify({directorio:'src'}))`, tmp]);
g = probarGuardia({ tool_name: "Edit", tool_input: { file_path: join(tmp, "fuera.txt") }, cwd: tmp });
if (g?.permissionDecision !== "deny") fallo(`guardia congelada: edición fuera de src/ debió dar "deny", dio ${JSON.stringify(g)}`);
g = probarGuardia({ tool_name: "Edit", tool_input: { file_path: join(tmp, "src", "dentro.txt") }, cwd: tmp });
if (g !== null) fallo(`guardia congelada: edición dentro de src/ no debía bloquearse`);
if (!fallos.some((f) => f.startsWith("guardia"))) ok("guardia.mjs: destructivos→ask, seguros→silencio, congelamiento→deny/permitir");

rmSync(tmp, { recursive: true, force: true });

// ── veredicto ────────────────────────────────────────────────────────────────
if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\nTodo verde. repofibe pasó las evals tier 1.");
