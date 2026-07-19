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

// ── 1b. Cada skill debe estar documentada en README.md y en el hook de sesión.
// Sin esto, una skill nueva puede quedar invisible en la UX (README) o en el
// contexto que se inyecta al abrir sesión — el drift real encontrado en la
// auditoría de 2026-07-19 (5 skills existían y no aparecían en ningún lado).
{
  const readme = readFileSync(join(RAIZ, "README.md"), "utf8");
  const sesion = readFileSync(join(RAIZ, "hooks", "sesion.mjs"), "utf8");
  const enReadme = new Set([...readme.matchAll(/`\/([a-z-]+)`/g)].map((m) => m[1]));
  const enSesion = new Set([...sesion.matchAll(/\/([a-z-]+)/g)].map((m) => m[1]));
  const faltanReadme = skills.filter((s) => !enReadme.has(s));
  const faltanSesion = skills.filter((s) => !enSesion.has(s));
  if (faltanReadme.length) fallo(`README.md no documenta: ${faltanReadme.join(", ")}`);
  if (faltanSesion.length) fallo(`hooks/sesion.mjs no lista: ${faltanSesion.join(", ")}`);
  if (!faltanReadme.length && !faltanSesion.length) ok("todas las skills están documentadas en README.md y listadas en sesion.mjs");
}

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

  // mapa.mjs: estructura de prueba → generar → buscar por nombre.
  execFileSync(process.execPath, ["-e",
    "const{mkdirSync,writeFileSync}=require('fs');const{join}=require('path');const b=process.argv[1];" +
    "mkdirSync(join(b,'src','componentes'),{recursive:true});" +
    "writeFileSync(join(b,'src','componentes','BotonLogin.jsx'),'x');" +
    "writeFileSync(join(b,'package.json'),'{}');", tmp]);
  r = correr("mapa.mjs", ["generar"]);
  if (!/Mapa generado/.test(r.stdout)) fallo(`mapa.mjs generar: ${r.stdout || r.stderr}`);
  r = correr("mapa.mjs", ["buscar", "login"]);
  if (!/BotonLogin\.jsx/.test(r.stdout)) fallo(`mapa.mjs buscar no ubicó BotonLogin.jsx: ${r.stdout}`);
  r = correr("mapa.mjs", ["ver"]);
  if (!/package\.json/.test(r.stdout)) fallo(`mapa.mjs ver no marca package.json como clave: ${r.stdout}`);

  // grafo.mjs: cadena a.js → b.js → c.js; impacto de c.js debe ser b (prof 1) y a (prof 2).
  execFileSync(process.execPath, ["-e",
    "const{writeFileSync}=require('fs');const{join}=require('path');const b=process.argv[1];" +
    "writeFileSync(join(b,'src','a.js'),\"import x from './b.js'\");" +
    "writeFileSync(join(b,'src','b.js'),\"import y from './c.js'\");" +
    "writeFileSync(join(b,'src','c.js'),'export default 1');", tmp]);
  r = correr("grafo.mjs", ["generar"]);
  if (!/2 dependencias internas/.test(r.stdout)) fallo(`grafo.mjs generar: esperaba 2 dependencias → ${r.stdout || r.stderr}`);
  r = correr("grafo.mjs", ["impacto", "src/c.js"]);
  if (!/prof 1:[\s\S]*src\/b\.js/.test(r.stdout) || !/prof 2:[\s\S]*src\/a\.js/.test(r.stdout)) fallo(`grafo.mjs impacto: cierre transitivo incorrecto → ${r.stdout}`);
  r = correr("grafo.mjs", ["frescura"]);
  if (!/confiable/.test(r.stdout)) fallo(`grafo.mjs frescura recién generado debía ser confiable: ${r.stdout}`);

  // checkpoint.mjs: commit base → 2 WIP → aplanar consolida solo los WIP.
  const gitTmp = (args) => spawnSync("git", ["-C", tmp, ...args], { encoding: "utf8" });
  gitTmp(["init", "-q"]); gitTmp(["config", "user.name", "eval"]); gitTmp(["config", "user.email", "eval@repofibe"]);
  gitTmp(["add", "-A"]); gitTmp(["commit", "-q", "-m", "base"]);
  execFileSync(process.execPath, ["-e", "require('fs').writeFileSync(require('path').join(process.argv[1],'w1.txt'),'1')", tmp]);
  r = correr("checkpoint.mjs", ["guardar", "primer avance"]);
  if (!/Checkpoint local/.test(r.stdout)) fallo(`checkpoint.mjs guardar: ${r.stdout || r.stderr}`);
  execFileSync(process.execPath, ["-e", "require('fs').writeFileSync(require('path').join(process.argv[1],'w2.txt'),'2')", tmp]);
  correr("checkpoint.mjs", ["guardar", "segundo avance"]);
  r = correr("checkpoint.mjs", ["restaurar"]);
  if (!/primer avance/.test(r.stdout) || !/fabrica-contexto|SPRINT/.test(r.stdout)) fallo(`checkpoint.mjs restaurar no muestra contexto: ${r.stdout}`);
  r = correr("checkpoint.mjs", ["aplanar", "feature completa"]);
  if (!/Aplanados 2/.test(r.stdout)) fallo(`checkpoint.mjs aplanar: esperaba consolidar 2 WIP → ${r.stdout || r.stderr}`);
  const titulos = gitTmp(["log", "--pretty=%s"]).stdout.trim().split("\n");
  if (titulos[0] !== "feature completa" || titulos.some((t) => t.startsWith("WIP:")) || titulos.at(-1) !== "base") {
    fallo(`checkpoint.mjs aplanar dejó historia incorrecta: ${titulos.join(" | ")}`);
  }
  if (!fallos.some((f) => f.startsWith("estado") || f.startsWith("memoria") || f.startsWith("mapa") || f.startsWith("grafo") || f.startsWith("checkpoint"))) ok("estado, memoria, mapa, grafo y checkpoint (WIP→aplanar sin tocar commits normales) funcionan");

  // pruebas.mjs: agrega src/a.test.js (importa a.js) sobre la cadena a→b→c ya
  // committeada, modifica c.js sin commitear, y confirma que a.test.js aparece
  // como afectado. Esto fija en rojo el bug real de 2026-07-19: git() devuelve
  // un string y "[...s1, ...s2]" hacía spread carácter por carácter en vez de
  // por línea — "Cambiados: 16" con letras sueltas en vez de rutas.
  execFileSync(process.execPath, ["-e",
    "require('fs').writeFileSync(require('path').join(process.argv[1],'src','a.test.js'),\"import a from './a.js'\")", tmp]);
  execFileSync(process.execPath, ["-e",
    "require('fs').appendFileSync(require('path').join(process.argv[1],'src','c.js'),'\\n// tocado')", tmp]);
  correr("grafo.mjs", ["generar"]);
  r = correr("pruebas.mjs", ["afectadas"]);
  if (!/src\/a\.test\.js/.test(r.stdout)) fallo(`pruebas.mjs afectadas no detectó a.test.js como afectado por el cambio en c.js → ${r.stdout || r.stderr}`);
  if (/^\s*[a-z]\s*$/m.test(r.stdout)) fallo(`pruebas.mjs afectadas: regresión del bug de spread por carácter → ${r.stdout}`);
  if (!fallos.some((f) => f.startsWith("pruebas.mjs"))) ok("pruebas.mjs afectadas: cierre transitivo hasta el test correcto (a.test.js) tras cambiar c.js");
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

// ── 6b. Funcional: sesion.mjs — la lista de skills se genera desde disco ────
// Fija en rojo el drift real de 2026-07-19: la lista vivía copiada a mano y
// se desactualizó en cuanto se agregaron skills nuevas.
{
  const r = spawnSync(process.execPath, [join(RAIZ, "hooks", "sesion.mjs")], {
    cwd: tmp, input: JSON.stringify({ cwd: tmp }), encoding: "utf8",
  });
  const faltantes = skills.filter((s) => !r.stdout.includes(`/${s}`));
  if (faltantes.length) fallo(`sesion.mjs no lista dinámicamente: ${faltantes.join(", ")} (¿volvió a copiarse a mano?)`);
  else ok(`sesion.mjs lista las ${skills.length} skills reales de disco, no una copia a mano`);
}

rmSync(tmp, { recursive: true, force: true });

// ── 7. Suites independientes (inteligencia, legal, seguridad de instalación) ─
// Viven aparte porque tienen su propio arnés (assert de Node, hogares
// temporales); se agregan aquí para que ningún push quede en verde con una
// de estas en rojo — el punto ciego que motivó esta integración.
for (const suite of ["inteligencia/validar.mjs", "legal/validar.mjs", "seguridad/instalacion-segura.mjs", "seguridad/instalacion-hosts.mjs", "nucleo/salud.mjs", "nucleo/secretos.mjs"]) {
  const ruta = join(RAIZ, "evals", suite);
  if (!existsSync(ruta)) continue;
  const r = spawnSync(process.execPath, [ruta], { encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) fallo(`evals/${suite}: ${(r.stderr || r.stdout).trim().split("\n").slice(0, 4).join(" | ")}`);
  else ok(`evals/${suite}: ${r.stdout.trim().split("\n").at(-1)}`);
}

// ── veredicto ────────────────────────────────────────────────────────────────
if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\nTodo verde. repofibe pasó las evals tier 1.");
