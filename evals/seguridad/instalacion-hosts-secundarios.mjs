#!/usr/bin/env node
// instalacion-hosts-secundarios.mjs — Arnés de evals aisladas para Cursor, Codex y OpenCode

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawnSync } from "node:child_process";

const RAIZ = join(import.meta.dirname, "..", "..");

function crearHogarTemp() {
  const tmp = mkdtempSync(join(tmpdir(), "repofibe-eval-hosts-sec-"));
  return {
    dir: tmp,
    env: {
      ...process.env,
      HOME: tmp,
      USERPROFILE: tmp,
      APPDATA: join(tmp, "AppData", "Roaming"),
      LOCALAPPDATA: join(tmp, "AppData", "Local")
    }
  };
}

function ejecutarInstalador(args, env) {
  return spawnSync(process.execPath, [join(RAIZ, "nucleo", "instalar.mjs"), ...args], {
    encoding: "utf8",
    env,
    timeout: 15000
  });
}

// 1. Probar Host Cursor (.cursor/skills)
function probarHostCursor() {
  const hogar = crearHogarTemp();
  mkdirSync(join(hogar.dir, ".cursor"), { recursive: true });

  // Instalación por host
  let r = ejecutarInstalador(["--host", "cursor"], hogar.env);
  if (r.status !== 0) throw new Error(`Cursor: falla en instalación: ${r.stderr || r.stdout}`);

  const destSkills = join(hogar.dir, ".cursor", "skills");
  if (!existsSync(destSkills)) throw new Error("Cursor: no se creó el directorio .cursor/skills");

  const skillsCopiadas = readdirSync(destSkills);
  if (skillsCopiadas.length < 20) throw new Error(`Cursor: se esperaban 20+ skills, encontradas ${skillsCopiadas.length}`);

  // Test de Ownership: modificar una skill del usuario
  const skillTest = join(destSkills, "repofibe-qa", "SKILL.md");
  const editadoUsuario = readFileSync(skillTest, "utf8") + "\n# Edición de prueba del usuario";
  writeFileSync(skillTest, editadoUsuario);

  // Refrescar
  r = ejecutarInstalador(["--refrescar"], hogar.env);
  if (r.status !== 0) throw new Error(`Cursor: falla al refrescar: ${r.stderr || r.stdout}`);

  const desintegrado = readFileSync(skillTest, "utf8");
  if (!desintegrado.includes("Edición de prueba del usuario")) {
    throw new Error("Cursor: el refresco sobrescribió la edición personal del usuario (falla de ownership)");
  }

  // Quitar
  r = ejecutarInstalador(["--quitar"], hogar.env);
  if (r.status !== 0) throw new Error(`Cursor: falla al quitar: ${r.stderr || r.stdout}`);

  console.log("  ok: Host Cursor (instalación, ownership y desinstalación aisladas)");
}

// 2. Probar Host Codex CLI (.codex/skills)
function probarHostCodex() {
  const hogar = crearHogarTemp();
  mkdirSync(join(hogar.dir, ".codex"), { recursive: true });

  let r = ejecutarInstalador(["--host", "codex"], hogar.env);
  if (r.status !== 0) throw new Error(`Codex: falla en instalación: ${r.stderr || r.stdout}`);

  const destSkills = join(hogar.dir, ".codex", "skills");
  if (!existsSync(destSkills)) throw new Error("Codex: no se creó el directorio .codex/skills");

  r = ejecutarInstalador(["--quitar"], hogar.env);
  if (r.status !== 0) throw new Error(`Codex: falla al quitar: ${r.stderr || r.stdout}`);

  console.log("  ok: Host Codex CLI (instalación y limpieza verificadas)");
}

// 3. Probar Host OpenCode (.config/opencode/skills o %APPDATA%/opencode/skills)
function probarHostOpenCode() {
  const hogar = crearHogarTemp();
  const dirConfig = join(hogar.dir, ".config", "opencode");
  mkdirSync(dirConfig, { recursive: true });

  let r = ejecutarInstalador(["--host", "opencode"], hogar.env);
  if (r.status !== 0) throw new Error(`OpenCode: falla en instalación: ${r.stderr || r.stdout}`);

  const destSkills = join(dirConfig, "skills");
  if (!existsSync(destSkills)) throw new Error("OpenCode: no se creó el directorio .config/opencode/skills");

  r = ejecutarInstalador(["--quitar"], hogar.env);
  if (r.status !== 0) throw new Error(`OpenCode: falla al quitar: ${r.stderr || r.stdout}`);

  console.log("  ok: Host OpenCode (instalación y limpieza en .config/opencode/skills verificadas)");
}

async function main() {
  console.log("Testeando instalación aislada en hosts secundarios...");
  probarHostCursor();
  probarHostCodex();
  probarHostOpenCode();
  console.log("Instalación por host secundario: cursor, codex y opencode verificados.");
}

main().catch(err => {
  console.error("Fallo en evals de hosts secundarios:", err);
  process.exit(1);
});
