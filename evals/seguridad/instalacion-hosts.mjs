#!/usr/bin/env node
// Pruebas de instalación por host (Claude Code y Antigravity) — punto 6 del
// PLAN-SUPERACION.md. Antes solo el host "generico" tenía cobertura
// (instalacion-segura.mjs); estos dos hosts se ejecutaban solo por lectura
// del SKILL.md, sin ningún test que demostrara instalar/refrescar/quitar.
// No usan la HOME real: cada caso trabaja contra un hogar temporal, y
// fuerza PATH vacío para que la CLI `claude` (que puede o no existir en la
// máquina de CI) NUNCA se encuentre — así el camino de fallback a copia se
// ejerce de forma determinista, sin depender del entorno.

import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTALADOR = join(RAIZ, "nucleo", "instalar.mjs");

// Quita del PATH solo los directorios que contienen un binario `claude`
// (puede existir de verdad en esta máquina, p.ej. instalado por npm), sin
// tocar el resto — así System32 y demás utilidades del sistema siguen
// disponibles y el proceso hijo de Windows no se rompe por falta de PATH.
function pathSinClaude() {
  const sep = process.platform === "win32" ? ";" : ":";
  const nombres = process.platform === "win32" ? ["claude.cmd", "claude.exe", "claude"] : ["claude"];
  const partes = (process.env.PATH || "").split(sep).filter(Boolean)
    .filter((dir) => !nombres.some((n) => existsSync(join(dir, n))));
  if (process.platform === "win32") {
    const system32 = join(process.env.SystemRoot || "C:\\Windows", "System32");
    if (!partes.includes(system32)) partes.push(system32);
  }
  return partes.join(sep);
}

function ejecutar(args, hogar, { sinClaude = false } = {}) {
  const entorno = {
    HOME: hogar,
    USERPROFILE: hogar,
    HOMEDRIVE: hogar.slice(0, 2),
    HOMEPATH: hogar.slice(2),
    PATH: sinClaude ? pathSinClaude() : process.env.PATH,
  };
  return spawnSync(process.execPath, [INSTALADOR, ...args], { env: entorno, encoding: "utf8" });
}

function exigirExito(resultado, contexto) {
  assert.equal(resultado.status, 0, `${contexto} fallo:\n${resultado.stdout}\n${resultado.stderr}`);
}

function probarHostClaude() {
  const temporal = mkdtempSync(join(tmpdir(), "repofibe-host-claude-"));
  const hogar = join(temporal, "hogar");
  try {
    // Presencia de ~/.claude activa detectar(); ausencia de la CLI real
    // fuerza el camino de fallback (copia de skills) de forma determinista.
    mkdirSync(join(hogar, ".claude"), { recursive: true });

    let r = ejecutar(["--host", "claude"], hogar, { sinClaude: true });
    exigirExito(r, "instalación claude");
    assert.match(r.stdout, /fallback a copia de skills/, "sin CLI de claude en PATH debe caer al modo copia, no reportó ese camino");

    const destino = join(hogar, ".claude", "skills");
    assert.ok(existsSync(destino), "no se crearon skills en ~/.claude/skills");
    const skills = readdirSync(destino).filter((n) => n.startsWith("repofibe-"));
    assert.ok(skills.length >= 20, `se esperaban 20+ skills repofibe-*, hay ${skills.length}`);
    assert.ok(existsSync(join(destino, "repofibe-fabrica", "SKILL.md")), "falta repofibe-fabrica/SKILL.md");
    // El name interno del SKILL.md instalado DEBE llevar el prefijo, para no
    // colisionar con otras suites (p.ej. la `qa` de gstack). El repo fuente
    // conserva el nombre corto.
    assert.match(readFileSync(join(destino, "repofibe-fabrica", "SKILL.md"), "utf8"), /^name:\s*repofibe-fabrica$/m,
      "el name interno de la skill instalada debe ser repofibe-fabrica (evita colisión con otras suites)");

    // Idempotencia: refrescar sin cambios no debe fallar ni duplicar.
    r = ejecutar(["--refrescar"], hogar);
    exigirExito(r, "refresco claude");
    const skillsTrasRefresco = readdirSync(destino).filter((n) => n.startsWith("repofibe-"));
    assert.equal(skillsTrasRefresco.length, skills.length, "el refresco no debe cambiar el conteo de skills");

    // Ownership: una edición del usuario sobrevive al refresco.
    const archivoEditado = join(destino, "repofibe-fabrica", "SKILL.md");
    writeFileSync(archivoEditado, readFileSync(archivoEditado, "utf8") + "\n<!-- nota del usuario -->\n", "utf8");
    r = ejecutar(["--refrescar"], hogar);
    exigirExito(r, "refresco tras edición");
    assert.match(readFileSync(archivoEditado, "utf8"), /nota del usuario/, "el refresco no debe pisar una skill editada por el usuario");

    r = ejecutar(["--quitar"], hogar);
    exigirExito(r, "desinstalación claude");
    assert.match(readFileSync(archivoEditado, "utf8"), /nota del usuario/, "--quitar debe conservar una skill editada por el usuario");
    const otraSkill = join(destino, "repofibe-oficina");
    assert.ok(!existsSync(otraSkill), "--quitar debió eliminar las skills no modificadas");
  } finally {
    try { spawnSync(process.platform === "win32" ? "cmd" : "rm", process.platform === "win32" ? ["/c", "rmdir", "/s", "/q", temporal] : ["-rf", temporal]); } catch {}
  }
}

function probarHostAntigravity() {
  const temporal = mkdtempSync(join(tmpdir(), "repofibe-host-antigravity-"));
  const hogar = join(temporal, "hogar");
  const workspace = join(temporal, "workspace");
  try {
    mkdirSync(join(hogar, ".gemini"), { recursive: true });
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(hogar, ".gemini", "GEMINI.md"), "# reglas globales del usuario\n", "utf8");

    let r = ejecutar(["--host", "antigravity", "--workspace", workspace], hogar);
    exigirExito(r, "instalación antigravity");

    const destino = join(hogar, ".gemini", "config", "skills");
    assert.ok(existsSync(destino), "no se crearon skills en ~/.gemini/config/skills");
    assert.ok(readdirSync(destino).filter((n) => n.startsWith("repofibe-")).length >= 20, "faltan skills repofibe-*");

    const gemini = readFileSync(join(hogar, ".gemini", "GEMINI.md"), "utf8");
    assert.match(gemini, /reglas globales del usuario/, "el bloque insertado no debe borrar contenido previo del usuario");
    assert.match(gemini, /repofibe:inicio[\s\S]*repofibe:fin/, "falta el bloque de reglas de repofibe con sus marcas");

    const workflows = join(workspace, ".agent", "workflows");
    assert.ok(existsSync(workflows), "no se generaron lanzadores en .agent/workflows con --workspace");
    const lanzador = join(workflows, "repofibe-fabrica.md");
    assert.ok(existsSync(lanzador), "falta el lanzador repofibe-fabrica.md");
    assert.match(readFileSync(lanzador, "utf8"), /repofibe-fabrica\/SKILL\.md/, "el lanzador no referencia la skill real");

    r = ejecutar(["--quitar"], hogar);
    exigirExito(r, "desinstalación antigravity");
    assert.equal(readFileSync(join(hogar, ".gemini", "GEMINI.md"), "utf8"), "# reglas globales del usuario\n", "--quitar debe restaurar GEMINI.md a su estado previo exacto");
    assert.ok(!existsSync(destino) || readdirSync(destino).filter((n) => n.startsWith("repofibe-")).length === 0, "--quitar debió limpiar las skills de antigravity");
  } finally {
    try { spawnSync(process.platform === "win32" ? "cmd" : "rm", process.platform === "win32" ? ["/c", "rmdir", "/s", "/q", temporal] : ["-rf", temporal]); } catch {}
  }
}

probarHostClaude();
probarHostAntigravity();
console.log("Instalación por host: claude (fallback determinista) y antigravity (bloque + lanzadores) verificados.");
