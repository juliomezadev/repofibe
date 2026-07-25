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

// Telemetría local: este hook ya corre en cada uso de herramienta, así que es
// el sensor natural de "qué se usa" sin pagar el arranque de otro proceso.
// Import DINÁMICO y protegido a propósito: si nucleo/ no estuviera (copia
// parcial, instalación a medias), un import estático fallido tumbaría el hook
// entero. Fail-open empieza por poder cargarse.
let registrar = () => false;
try { ({ registrar } = await import("../nucleo/traza.mjs")); } catch {}

function leerJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return null; }
}

// Contexto de lo que se va a registrar. SOLO metadatos: nombre de herramienta
// y, si aplica, nombre de skill. Nunca el comando, la ruta ni los argumentos
// — un comando de shell puede llevar una credencial y esto escribe a disco.
let contexto = null;

function salir(decision) {
  try { if (contexto) registrar({ ...contexto, d: decision }, { raiz: contexto.raiz }); } catch {}
  process.exit(0);
}

function responder(decision, razon) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: razon,
    },
  }));
  salir(decision);
}

// Patrones destructivos: [regex, descripción]. Cobertura Bash + PowerShell + cmd + SQL.
const DESTRUCTIVOS = [
  // El patrón original exigía que `r` y `f` estuvieran en el MISMO token, así
  // que `rm -r -f x` y `rm --recursive --force x` pasaban sin aviso — dos de
  // las formas más comunes de escribirlo (encontrado auditando, 2026-07-25).
  // Ahora se piden por separado con lookaheads acotados a `[^\n;|&]*`, que
  // impide cruzar a otro comando encadenado.
  [/\brm\b(?=[^\n;|&]*\s-{1,2}(?:[a-z]*r[a-z]*|recursive)\b)(?=[^\n;|&]*\s-{1,2}(?:[a-z]*f[a-z]*|force)\b)/i,
    "rm recursivo y forzado (en cualquier orden, flags cortos o largos)"],
  [/\bfind\b[^\n;|&]*\s-delete\b/i, "find -delete (borrado masivo sin confirmación)"],
  [/\bfind\b[^\n;|&]*-exec\s+rm\b/i, "find -exec rm (borrado masivo)"],
  [/\bshred\b/i, "shred (borrado irrecuperable)"],
  [/\btruncate\b[^\n;|&]*(-s|--size)\s*0\b/i, "truncate a cero (vacía el archivo)"],
  [/\bchmod\b[^\n;|&]*-R[^\n;|&]*\s0{3,4}\b/i, "chmod -R 000 (deja el árbol inaccesible)"],
  // Descartan TODO el trabajo no commiteado, igual que `git reset --hard`.
  // Solo se alerta sobre el árbol completo (`.` o sin ruta): restaurar un
  // archivo concreto es una operación cotidiana y alertarla sería ruido.
  [/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/i, "git checkout -- . (descarta TODOS los cambios locales)"],
  [/\bgit\s+restore\s+(--\s+)?\.(\s|$)/i, "git restore . (descarta TODOS los cambios locales)"],
  [/\bgit\s+stash\s+(clear|drop)\b/i, "git stash clear/drop (borra trabajo guardado)"],
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

  // Una invocación de skill llega como herramienta "Skill"; el nombre de la
  // skill es el dato que de verdad importa para saber qué se usa.
  contexto = {
    raiz: cwd,
    ev: tool === "Skill" ? "skill" : "herramienta",
    n: tool === "Skill" ? String(input.skill ?? "?") : tool,
  };

  // ── Protección 2: congelamiento de directorio ─────────────────────────────
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const objetivo = resolve(input.file_path ?? input.notebook_path ?? "");

    // Configuración del propio guardia. Antes esto era un `deny` absoluto, y
    // eso dejaba MUERTA a la skill /guardian: sus cuatro comandos ("guardián
    // on/off", "congela a <dir>", "descongela") consisten precisamente en
    // escribir estos archivos. El bug estuvo invisible mientras los hooks no
    // corrían; al activarlos quedó a la vista.
    //
    // El criterio correcto no es "el agente nunca toca esto", es **asimetría
    // por dirección**: encender el guardia o congelar deja al usuario MÁS
    // protegido y no necesita fricción; apagarlo o descongelar lo deja menos
    // protegido y exige su aprobación explícita. `ask` se la pide — que es lo
    // que el `deny` pretendía lograr, pero sin romper la skill. Un `deny` que
    // obliga al usuario a editar JSON a mano termina en usuarios que no
    // configuran nada, o que apagan la protección por otra vía.
    if (objetivo.endsWith("guardia.json") || objetivo.endsWith("congelar.json")) {
      const contenido = String(input.content ?? input.new_string ?? "");
      const apagaGuardia = /"activo"\s*:\s*false/i.test(contenido);
      const descongela = objetivo.endsWith("congelar.json") && !/"directorio"\s*:\s*"[^"]+"/i.test(contenido);
      // Sin contenido visible (p.ej. un Edit parcial) no se puede saber la
      // dirección del cambio: ante la duda, se pregunta.
      const direccionDesconocida = contenido.trim() === "";

      if (apagaGuardia || descongela || direccionDesconocida) {
        responder("ask",
          `GUARDIA repofibe: se va a REDUCIR tu protección (${objetivo.endsWith("guardia.json") ? "apagar el guardia de comandos destructivos" : "levantar el congelamiento de directorio"}). ` +
          `Confírmalo tú: el agente no puede reducirla por su cuenta.`);
      }
      // Encender el guardia o congelar un directorio: dirección segura, pasa
      // sin fricción y queda registrado en la traza igual que todo lo demás.
      salir("permitir");
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
    salir("permitir"); // edición permitida, sin opinión
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

  salir("permitir");
} catch {
  process.exit(0); // fail-open: nunca romper la sesión
}
