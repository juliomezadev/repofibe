#!/usr/bin/env node
// checkpoint.mjs — checkpoints continuos de repofibe.
// Commits WIP locales con contexto estructurado del sprint en el cuerpo:
// si la sesión muere, /contexto restaurar reconstruye dónde ibas. Antes del
// PR, "aplanar" consolida SOLO la racha de WIP consecutivos (jamás toca
// commits normales) para que bisect quede limpio.
//
// Uso:
//   node checkpoint.mjs guardar ["nota"]   # commit WIP local con contexto
//   node checkpoint.mjs restaurar          # reconstruye el contexto de trabajo
//   node checkpoint.mjs aplanar ["mensaje"] # consolida la racha WIP en un commit

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = process.cwd();
const git = (args, ms = 8000) =>
  execFileSync("git", ["-C", RAIZ, ...args], { encoding: "utf8", timeout: ms, stdio: ["ignore", "pipe", "pipe"] }).trim();

function sprint() {
  try { return JSON.parse(readFileSync(join(RAIZ, ".fabrica", "sprint.json"), "utf8")); } catch { return null; }
}

try { git(["rev-parse", "--git-dir"]); } catch { console.error("No es un repo git."); process.exit(1); }

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "guardar": {
    const nota = args.join(" ").trim();
    git(["add", "-A"]);
    const staged = git(["diff", "--cached", "--name-only"]);
    if (!staged) { console.log("Nada que guardar: el árbol está limpio."); break; }
    const s = sprint();
    const titulo = `WIP: ${nota || s?.etapa || "checkpoint"}`;
    const cuerpo = [
      "[fabrica-contexto]",
      s?.objetivo ? `objetivo: ${s.objetivo}` : null,
      s?.etapa ? `etapa: ${s.etapa}` : null,
      s?.historial?.length ? `ultimo-paso: ${s.historial.at(-1).skill} — ${s.historial.at(-1).resultado}` : null,
      s?.pendientes?.length ? `pendientes: ${s.pendientes.join(" | ")}` : null,
    ].filter(Boolean).join("\n");
    git(["commit", "-m", titulo, "-m", cuerpo]);
    console.log(`Checkpoint local: "${titulo}" (${staged.split("\n").length} archivos). No se pushea — es red de seguridad, no historia.`);
    break;
  }

  case "restaurar": {
    let wips = "";
    try { wips = git(["log", "--grep", "^WIP:", "-n", "5", "--pretty=format:--- %h %ad%n%s%n%b", "--date=format:%Y-%m-%d %H:%M"]); } catch {}
    if (wips) { console.log("CHECKPOINTS RECIENTES (más nuevo primero):"); console.log(wips); }
    else console.log("Sin checkpoints WIP en el historial.");
    const s = sprint();
    if (s) {
      console.log(`\nSPRINT: ${s.objetivo} — etapa ${s.etapa}`);
      if (s.pendientes?.length) { console.log("PENDIENTES:"); s.pendientes.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); }
    }
    const sucio = git(["status", "--porcelain"]);
    console.log(sucio ? `\nÁrbol con cambios sin commitear (${sucio.split("\n").length} archivos) — revisa git status.` : "\nÁrbol limpio.");
    break;
  }

  case "aplanar": {
    const titulos = git(["log", "--pretty=%s", "-n", "50"]).split("\n");
    let n = 0;
    while (n < titulos.length && titulos[n].startsWith("WIP:")) n++;
    if (n === 0) { console.log("HEAD no es un WIP: nada que aplanar."); break; }
    if (n === titulos.length) { console.error("Toda la historia visible es WIP — aplana a mano para no perder el commit raíz."); process.exit(1); }
    const mensaje = args.join(" ").trim() || `checkpoint: trabajo consolidado (${n} WIP)`;
    git(["reset", "--soft", `HEAD~${n}`]);
    git(["commit", "-m", mensaje]);
    console.log(`Aplanados ${n} commits WIP en uno: "${mensaje}". Los commits normales no se tocaron.`);
    break;
  }

  default:
    console.error("Uso: guardar [nota] | restaurar | aplanar [mensaje]");
    process.exit(1);
}
