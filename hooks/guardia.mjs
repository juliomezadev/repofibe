#!/usr/bin/env node
// guardia.mjs — hook PreToolUse de repofibe (solo Claude Code).
//
// Dos protecciones deterministas:
//   1. Comandos destructivos (rm -rf, git reset --hard, DROP TABLE, format...)
//      → el harness PIDE CONFIRMACIÓN al usuario, siempre, aunque el modelo
//      no se acuerde de tener cuidado. Se apaga con /guardian off
//      (.fabrica/guardia.json → {"activo": false}).
//   2. Congelamiento de directorio (.fabrica/congelar.json → {"directorio": "src"})
//      → ediciones fuera del directorio congelado se DENIEGAN con explicación.
//
// Diseño: fail-open. Cualquier error interno → exit 0 sin salida. Un hook de
// seguridad jamás debe romper la sesión del usuario.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

function leerJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return null; }
}

function responder(decision, razon) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: razon,
    },
  }));
  process.exit(0);
}

// Patrones destructivos: [regex, descripción]. Cobertura Bash + PowerShell + cmd + SQL.
const DESTRUCTIVOS = [
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*[rf][a-z]*\b/i, "rm recursivo/forzado"],
  [/\b(ri|del|erase|Remove-Item)\b[^|;]*(-Recurse|-Force)\b/i, "Borrado recursivo/forzado en PowerShell"],
  [/\bRemove-Item\b[^|;]*-Recurse\b[^|;]*-Force\b/i, "Remove-Item -Recurse -Force"],
  [/\bRemove-Item\b[^|;]*-Force\b[^|;]*-Recurse\b/i, "Remove-Item -Force -Recurse"],
  [/\bgit\s+reset\s+--hard\b/i, "git reset --hard (descarta cambios locales)"],
  [/\bgit\s+clean\s+-[a-z]*f/i, "git clean -f (borra archivos no versionados)"],
  [/\bgit\s+push\b(?![^\n]*--force-with-lease)[^\n]*(--force\b|\s-f\b)/i, "git push --force sin --force-with-lease"],
  [/\bgit\s+branch\s+-D\b/i, "borrado forzado de rama"],
  [/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, "SQL destructivo"],
  [/\b(del|erase)\s+(\/[a-z]\s+)*\/s\b/i, "del /s (borrado recursivo cmd)"],
  [/\b(rd|rmdir)\s+(\/[a-z]\s+)*\/s\b/i, "rd /s (borrado recursivo cmd)"],
  [/\bformat\s+[a-z]:/i, "formateo de unidad"],
  [/\bmkfs(\.\w+)?\b/i, "creación de sistema de archivos"],
  [/\bdd\b[^\n]*\bof=\/dev\//i, "dd sobre dispositivo"],
  [/>\s*\/dev\/sd[a-z]\b/i, "escritura directa a disco"],
];

try {
  const entrada = JSON.parse(readFileSync(0, "utf8")); // stdin completo
  const tool = entrada.tool_name ?? "";
  const input = entrada.tool_input ?? {};
  const cwd = entrada.cwd ?? process.cwd();

  // ── Protección 2: congelamiento de directorio ─────────────────────────────
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const objetivo = resolve(input.file_path ?? input.notebook_path ?? "");
    if (objetivo.endsWith("guardia.json") || objetivo.endsWith("congelar.json")) {
      responder("deny", "El agente no puede modificar su propia configuración de guardia directamente. El usuario debe hacerlo.");
    }

    const congelar = leerJson(join(cwd, ".fabrica", "congelar.json"));
    if (congelar?.directorio) {
      const permitido = resolve(cwd, congelar.directorio);
      const fabrica = resolve(cwd, ".fabrica");
      const dentro = (base) => objetivo === base || objetivo.startsWith(base + sep);
      if (objetivo && !dentro(permitido) && !dentro(fabrica)) {
        responder("deny",
          `Ediciones congeladas a "${congelar.directorio}" (activado con /guardian congelar). ` +
          `El archivo ${objetivo} está fuera del límite. Descongela con /guardian descongelar si es intencional.`);
      }
    }
    process.exit(0); // edición permitida, sin opinión
  }

  // ── Protección 1: comandos destructivos ───────────────────────────────────
  if (tool === "Bash" || tool === "PowerShell") {
    const config = leerJson(join(cwd, ".fabrica", "guardia.json"));
    if (config && config.activo === false) process.exit(0); // guardia apagada explícitamente
    const comando = String(input.command ?? "");
    for (const [patron, descripcion] of DESTRUCTIVOS) {
      if (patron.test(comando)) {
        responder("ask",
          `GUARDIA repofibe: el comando contiene "${descripcion}". ` +
          `Confirma que es intencional antes de ejecutarlo. (Desactivar: /guardian off)`);
      }
    }
  }

  process.exit(0);
} catch {
  process.exit(0); // fail-open: nunca romper la sesión
}
