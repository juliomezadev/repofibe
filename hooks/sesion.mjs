#!/usr/bin/env node
// sesion.mjs — hook SessionStart de repofibe (solo Claude Code).
// Inyecta al inicio de cada sesión: estado del sprint + últimas memorias del
// proyecto. Así cualquier sesión nueva retoma el contexto sin que el usuario
// tenga que repetirlo. Silencioso si no hay nada que decir. Fail-open.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

try {
  const entrada = JSON.parse(readFileSync(0, "utf8"));
  const cwd = entrada.cwd ?? process.cwd();
  const partes = [];

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
      "\nSkills: /fabrica (orquestador), /oficina, /plan-ceo, /plan-ing, /plan-diseno, /construir, /revisar, /investigar, /qa, /shipear, /retro, /memoria, /seguridad, /guardian.\n"
    );
  }
  process.exit(0);
} catch {
  process.exit(0);
}
