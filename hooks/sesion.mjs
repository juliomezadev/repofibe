#!/usr/bin/env node
// sesion.mjs — hook SessionStart de repofibe (solo Claude Code).
// Inyecta al inicio de cada sesión: estado del sprint + últimas memorias del
// proyecto. Así cualquier sesión nueva retoma el contexto sin que el usuario
// tenga que repetirlo. Silencioso si no hay nada que decir. Fail-open.

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Chequeo de actualización: throttled a 1/hora, tolerante a fallos de red,
// silencioso salvo que de verdad haya versión nueva. Solo aplica si la raíz
// de repofibe es un clon git (instalaciones por copia no se auto-chequean).
function chequearActualizacion() {
  try {
    const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
    if (!existsSync(join(raiz, ".git"))) return null;
    const sello = join(homedir(), ".repofibe", "ultima-verificacion");
    if (existsSync(sello) && Date.now() - statSync(sello).mtimeMs < 3600_000) return null;
    mkdirSync(dirname(sello), { recursive: true });
    writeFileSync(sello, new Date().toISOString());
    const git = (args, ms = 4000) => execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8", timeout: ms, stdio: ["ignore", "pipe", "ignore"] }).trim();
    git(["fetch", "--quiet"]);
    const local = git(["rev-parse", "HEAD"]);
    const remoto = git(["rev-parse", "@{u}"]);
    if (local === remoto || git(["merge-base", "HEAD", "@{u}"]) !== local) return null;

    // Hay versión nueva y es fast-forward limpio. Auto-actualizar es el
    // default ("que lo actualice de una"); se apaga con
    // ~/.repofibe/config.json → {"auto_actualizar": false}.
    let auto = true;
    try { auto = JSON.parse(readFileSync(join(homedir(), ".repofibe", "config.json"), "utf8")).auto_actualizar !== false; } catch {}
    if (auto) {
      try {
        git(["pull", "--ff-only", "--quiet"], 15000);
        execFileSync(process.execPath, [join(raiz, "nucleo", "instalar.mjs"), "--refrescar"], { timeout: 15000, stdio: "ignore" });
        const v = readFileSync(join(raiz, "VERSION"), "utf8").trim();
        return `[repofibe] Auto-actualizado a la versión ${v} (git pull + refresco de skills). Cambios: ver CHANGELOG.md.`;
      } catch { /* si falla, cae al aviso manual */ }
    }
    return `[repofibe] Hay una actualización disponible: ejecuta "git -C ${raiz} pull" y reinstala (instalar.ps1 / instalar.sh).`;
  } catch { return null; }
}

try {
  const entrada = JSON.parse(readFileSync(0, "utf8"));
  const cwd = entrada.cwd ?? process.cwd();
  const partes = [];

  const aviso = chequearActualizacion();
  if (aviso) partes.push(aviso);

  const sprint = (() => {
    try { return JSON.parse(readFileSync(join(cwd, ".fabrica", "sprint.json"), "utf8")); }
    catch { return null; }
  })();
  if (sprint?.objetivo) {
    partes.push(`Sprint activo: "${sprint.objetivo}" — etapa: ${sprint.etapa}.`);
    const ult = (sprint.historial ?? []).slice(-2);
    for (const h of ult) partes.push(`  Último paso: ${h.skill} → ${h.resultado}`);
    if (sprint.pendientes?.length) partes.push(`  Pendientes: ${sprint.pendientes.length} (ver con /fabrica estado).`);
  }

  const rutaMem = join(cwd, ".fabrica", "memoria.jsonl");
  if (existsSync(rutaMem)) {
    const lineas = readFileSync(rutaMem, "utf8").split("\n").filter(Boolean).slice(-3);
    const memorias = lineas
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    if (memorias.length) {
      partes.push("Memoria reciente del proyecto:");
      for (const m of memorias) partes.push(`  - (${m.tipo}) ${m.texto}`);
    }
  }

  if (partes.length) {
    process.stdout.write(
      "[repofibe] Contexto de la fábrica:\n" + partes.join("\n") +
      "\nSkills: /fabrica (orquestador), /razonar, /complejo, /oficina, /spec, /plan-ceo, /plan-ing, /plan-diseno, /autoplan, /construir, /revisar, /investigar, /qa, /shipear, /retro, /memoria, /seguridad, /guardian.\n"
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
