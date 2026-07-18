#!/usr/bin/env node
// instalar.mjs — instalador multi-host de repofibe.
//
// Una sola fuente canónica (skills/*/SKILL.md, estándar Agent Skills) y
// adaptadores finos por host. COPIAS, nunca symlinks: Windows sin Developer
// Mode funciona idéntico a Unix, y reinstalar = actualizar (idempotente).
//
// Uso:
//   node nucleo/instalar.mjs                     # autodetecta hosts instalados
//   node nucleo/instalar.mjs --host claude
//   node nucleo/instalar.mjs --host antigravity [--workspace <ruta>]
//   node nucleo/instalar.mjs --host codex|cursor|opencode|generico
//   node nucleo/instalar.mjs --quitar            # desinstala todo lo instalado
//
// Registro de lo instalado: ~/.repofibe/instalado.json (la desinstalación lo lee).

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync, rmdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Ejecuta sin shell (sin inyección, y las rutas con espacios funcionan).
// En Windows los CLIs de npm son shims .cmd: se reintenta con la extensión.
function ejecutar(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "pipe" });
  } catch (e) {
    if (process.platform === "win32" && (e.code === "ENOENT" || e.code === "EINVAL")) {
      execFileSync(cmd + ".cmd", args, { stdio: "pipe" });
    } else {
      throw e;
    }
  }
}

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOGAR = homedir();
const APP = join(HOGAR, ".repofibe", "app");
const REGISTRO = join(HOGAR, ".repofibe", "instalado.json");
const MARCA_INICIO = "<!-- repofibe:inicio -->";
const MARCA_FIN = "<!-- repofibe:fin -->";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : null; };
const hostPedido = flag("--host");
const workspace = flag("--workspace");
const quitar = args.includes("--quitar");

function skills() {
  return readdirSync(join(RAIZ, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(RAIZ, "skills", d.name, "SKILL.md")))
    .map((d) => d.name);
}

function leerRegistro() {
  try { return JSON.parse(readFileSync(REGISTRO, "utf8")); } catch { return { rutas: [], bloques: [] }; }
}
function guardarRegistro(r) {
  mkdirSync(dirname(REGISTRO), { recursive: true });
  writeFileSync(REGISTRO, JSON.stringify(r, null, 2) + "\n", "utf8");
}
function anotar(registro, ruta) { if (!registro.rutas.includes(ruta)) registro.rutas.push(ruta); }

// Copia el corazón compartido a ~/.repofibe/app — el fallback que toda skill
// instalada fuera del repo usa para encontrar plantillas/ y nucleo/.
function instalarApp(registro) {
  for (const d of ["plantillas", "nucleo"]) {
    cpSync(join(RAIZ, d), join(APP, d), { recursive: true });
  }
  for (const f of ["FILOSOFIA.md", "VERSION"]) {
    cpSync(join(RAIZ, f), join(APP, f));
  }
  anotar(registro, APP);
  console.log(`  núcleo compartido → ${APP}`);
}

function copiarSkills(registro, destinoBase, prefijo = "repofibe-") {
  mkdirSync(destinoBase, { recursive: true });
  for (const s of skills()) {
    const destino = join(destinoBase, prefijo + s);
    cpSync(join(RAIZ, "skills", s), destino, { recursive: true });
    anotar(registro, destino);
  }
  console.log(`  ${skills().length} skills → ${destinoBase}`);
}

// Inserta/reemplaza el bloque marcado en un archivo de reglas (GEMINI.md / AGENTS.md).
function ponerBloque(registro, archivo, contenido) {
  mkdirSync(dirname(archivo), { recursive: true });
  const bloque = `${MARCA_INICIO}\n${contenido.trim()}\n${MARCA_FIN}\n`;
  let texto = existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
  const i = texto.indexOf(MARCA_INICIO), f = texto.indexOf(MARCA_FIN);
  if (i >= 0 && f > i) texto = texto.slice(0, i) + bloque + texto.slice(f + MARCA_FIN.length + 1);
  else texto = texto.trimEnd() + (texto ? "\n\n" : "") + bloque;
  writeFileSync(archivo, texto, "utf8");
  if (!registro.bloques.includes(archivo)) registro.bloques.push(archivo);
  console.log(`  bloque de reglas → ${archivo}`);
}

function bloqueReglas() {
  const lista = skills().map((s) => "repofibe-" + s).join(", ");
  return `## repofibe — La Fábrica
Equipo de ingeniería virtual en español. Skills instaladas (Agent Skills): ${lista}.
- Flujo de sprint: pensar (oficina) → planear (plan-ceo, plan-ing, plan-diseno) → construir → revisar → probar (qa) → shipear → retro. Orquestador: repofibe-fabrica.
- Protocolo: evidencia antes de afirmación; causa raíz antes de parche; leer antes de escribir. Detalle: ~/.repofibe/app/plantillas/razonamiento-fable.md
- Antes de comandos destructivos (rm -rf, git reset --hard, push --force, DROP TABLE): explicar qué se pierde y pedir confirmación explícita.`;
}

// ── hosts ────────────────────────────────────────────────────────────────────
const HOSTS = {
  claude: {
    detectar: () => existsSync(join(HOGAR, ".claude")),
    instalar(registro) {
      // Camino preferido: plugin nativo (skills + hooks deterministas).
      try {
        ejecutar("claude", ["plugin", "marketplace", "add", RAIZ]);
        ejecutar("claude", ["plugin", "install", "repofibe@repofibe-marketplace"]);
        console.log("  plugin nativo instalado (incluye hooks deterministas)");
        return;
      } catch {
        console.log("  CLI de claude no disponible u ocupada — fallback a copia de skills");
      }
      // Fallback: copia de skills (sin hooks — /guardian queda a nivel de prompt).
      copiarSkills(registro, join(HOGAR, ".claude", "skills"));
      console.log("  AVISO: en modo copia los hooks no se cargan. Para guardias deterministas: claude plugin marketplace add <ruta-repofibe> && claude plugin install repofibe@repofibe-marketplace");
    },
  },
  antigravity: {
    detectar: () => existsSync(join(HOGAR, ".gemini")),
    instalar(registro) {
      copiarSkills(registro, join(HOGAR, ".gemini", "config", "skills"));
      ponerBloque(registro, join(HOGAR, ".gemini", "GEMINI.md"), bloqueReglas());
      if (workspace && typeof workspace === "string") {
        const wf = join(resolve(workspace), ".agent", "workflows");
        mkdirSync(wf, { recursive: true });
        for (const s of skills()) {
          const archivo = join(wf, `repofibe-${s}.md`);
          writeFileSync(archivo,
            `---\ndescription: repofibe /${s} — ver skill repofibe-${s}\n---\n` +
            `Lee el archivo ~/.gemini/config/skills/repofibe-${s}/SKILL.md y ejecútalo al pie de la letra. ` +
            `La raíz de repofibe es ~/.repofibe/app.\n`, "utf8");
          anotar(registro, archivo);
        }
        console.log(`  workflows de workspace → ${wf}`);
      } else {
        console.log("  (opcional) --workspace <ruta> genera lanzadores /repofibe-* en .agent/workflows/");
      }
    },
  },
  codex: {
    detectar: () => existsSync(join(HOGAR, ".codex")),
    instalar(registro) { copiarSkills(registro, join(HOGAR, ".codex", "skills")); },
  },
  cursor: {
    detectar: () => existsSync(join(HOGAR, ".cursor")),
    instalar(registro) { copiarSkills(registro, join(HOGAR, ".cursor", "skills")); },
  },
  opencode: {
    detectar: () => existsSync(join(HOGAR, ".config", "opencode")),
    instalar(registro) { copiarSkills(registro, join(HOGAR, ".config", "opencode", "skills")); },
  },
  generico: {
    detectar: () => false, // solo explícito: --host generico --workspace <ruta>
    instalar(registro) {
      const base = resolve(typeof workspace === "string" ? workspace : process.cwd());
      copiarSkills(registro, join(base, ".agent", "skills"));
      ponerBloque(registro, join(base, "AGENTS.md"), bloqueReglas());
    },
  },
};

// ── principal ────────────────────────────────────────────────────────────────
if (quitar) {
  const registro = leerRegistro();
  for (const ruta of registro.rutas) {
    try { rmSync(ruta, { recursive: true, force: true }); console.log(`  eliminado: ${ruta}`); } catch {}
  }
  // Carpetas padre que quedaron vacías (ej. .agent/skills): rmdirSync no
  // recursivo falla si tienen contenido — exactamente lo que queremos.
  for (const ruta of registro.rutas) {
    try { rmdirSync(dirname(ruta)); } catch {}
    try { rmdirSync(dirname(dirname(ruta))); } catch {}
  }
  for (const archivo of registro.bloques) {
    try {
      const texto = readFileSync(archivo, "utf8");
      const i = texto.indexOf(MARCA_INICIO), f = texto.indexOf(MARCA_FIN);
      if (i >= 0 && f > i) writeFileSync(archivo, texto.slice(0, i) + texto.slice(f + MARCA_FIN.length + 1), "utf8");
      console.log(`  bloque removido de: ${archivo}`);
    } catch {}
  }
  try { ejecutar("claude", ["plugin", "uninstall", "repofibe"]); console.log("  plugin de Claude desinstalado"); } catch {}
  guardarRegistro({ rutas: [], bloques: [] });
  console.log("repofibe desinstalado. (~/.repofibe/memoria.jsonl se conserva; bórralo a mano si quieres.)");
  process.exit(0);
}

const elegidos = hostPedido && hostPedido !== true
  ? (hostPedido === "todos" ? Object.keys(HOSTS) : [hostPedido])
  : Object.keys(HOSTS).filter((h) => HOSTS[h].detectar());

if (!elegidos.length) {
  console.error("No se detectó ningún host. Usa --host <claude|antigravity|codex|cursor|opencode|generico>.");
  process.exit(1);
}
if (elegidos.some((h) => !HOSTS[h])) {
  console.error(`Host desconocido. Válidos: ${Object.keys(HOSTS).join(", ")}, todos.`);
  process.exit(1);
}

const registro = leerRegistro();
instalarApp(registro);
for (const h of elegidos) {
  console.log(`\n[${h}]`);
  HOSTS[h].instalar(registro);
}
guardarRegistro(registro);
console.log(`\nListo. repofibe ${readFileSync(join(RAIZ, "VERSION"), "utf8").trim()} instalado en: ${elegidos.join(", ")}.`);
console.log("Actualizar = volver a ejecutar este instalador. Desinstalar = --quitar.");
