#!/usr/bin/env node
// sesion.mjs — hook SessionStart de repofibe (solo Claude Code).
// Inyecta al inicio de cada sesión: estado del sprint + últimas memorias del
// proyecto. Así cualquier sesión nueva retoma el contexto sin que el usuario
// tenga que repetirlo. Silencioso si no hay nada que decir. Fail-open.

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Lista de skills generada desde disco, no copiada a mano — el mismo
// principio que bloqueReglas() en instalar.mjs. Copiar la lista a mano fue
// exactamente la causa del drift real encontrado en la auditoría de
// 2026-07-19 (5 skills existían y no aparecían aquí). Este hook solo corre
// en instalación por plugin nativo (el modo copia no registra hooks.json),
// así que la estructura del repo junto a este archivo siempre está intacta.
function listaSkills() {
  try {
    const dirSkills = join(dirname(dirname(fileURLToPath(import.meta.url))), "skills");
    const nombres = readdirSync(dirSkills, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(dirSkills, d.name, "SKILL.md")))
      .map((d) => d.name)
      .sort();
    if (!nombres.length) throw new Error("sin skills en disco");
    return nombres.map((n) => `/${n}`).join(", ");
  } catch {
    // Fallback estático solo si no se pudo leer disco (no debería pasar).
    return "/fabrica, /razonar, /complejo, /ubicar, /grafo, /oficina, /spec, /plan-ceo, /plan-ing, /plan-diseno, /diseno, /design-review, /autoplan, /construir, /revisar, /investigar, /qa, /scrape, /autenticar, /shipear, /retro, /memoria, /seguridad, /guardian, /legal, /docs, /contexto, /segunda-opinion, /pruebas-afectadas, /desplegar, /canario, /benchmark";
  }
}

// Chequeo de actualización: throttled a 1/hora, tolerante a fallos de red,
// silencioso salvo que de verdad haya versión nueva. Solo aplica si la raíz
// de repofibe es un clon git (instalaciones por copia no se auto-chequean).
//
// Auto-pull es OPT-IN ESTRICTO: por defecto solo avisa. Se activa con
// ~/.repofibe/config.json → {"auto_actualizar": true}. Escribir en el
// working tree del usuario sin que lo haya pedido explícitamente no es un
// default aceptable — "que se actualice de una" es una decisión del
// usuario, no del instalador.
function chequearActualizacion() {
  try {
    const candidata = dirname(dirname(fileURLToPath(import.meta.url)));
    if (!existsSync(join(candidata, ".git"))) return null;
    const git = (args, ms = 4000) => execFileSync("git", ["-C", candidata, ...args], { encoding: "utf8", timeout: ms, stdio: ["ignore", "pipe", "ignore"] }).trim();
    // La raíz real la da git, no aritmética de rutas — así una skill copiada
    // dentro de un repo ajeno nunca hereda ese repo como si fuera repofibe.
    const raiz = git(["rev-parse", "--show-toplevel"]);
    if (!existsSync(join(raiz, "nucleo", "instalar.mjs"))) return null;

    const sello = join(homedir(), ".repofibe", "ultima-verificacion");
    if (existsSync(sello) && Date.now() - statSync(sello).mtimeMs < 3600_000) return null;
    mkdirSync(dirname(sello), { recursive: true });
    writeFileSync(sello, new Date().toISOString());

    git(["fetch", "--quiet"]);
    const local = git(["rev-parse", "HEAD"]);
    const remoto = git(["rev-parse", "@{u}"]);
    if (local === remoto || git(["merge-base", "HEAD", "@{u}"]) !== local) return null;

    let auto = false;
    try { auto = JSON.parse(readFileSync(join(homedir(), ".repofibe", "config.json"), "utf8")).auto_actualizar === true; } catch {}
    if (auto) {
      try {
        const sucio = git(["status", "--porcelain"]); if (sucio) throw new Error("dirty");
        git(["pull", "--ff-only", "--quiet"], 15000);
        execFileSync(process.execPath, [join(raiz, "nucleo", "instalar.mjs"), "--refrescar"], { timeout: 15000, stdio: "ignore" });
        const v = readFileSync(join(raiz, "VERSION"), "utf8").trim();
        return `[repofibe] Auto-actualizado a la versión ${v} (git pull + refresco de skills). Cambios: ver CHANGELOG.md.`;
      } catch { /* si falla (árbol sucio, red, etc.) cae al aviso manual */ }
    }
    return `[repofibe] Hay una actualización disponible: ejecuta "git -C ${raiz} pull" y reinstala, o activa auto_actualizar:true en ~/.repofibe/config.json.`;
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
      `\nSkills: ${listaSkills()}.\n`
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
