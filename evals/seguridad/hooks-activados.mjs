#!/usr/bin/env node
// evals/seguridad/hooks-activados.mjs — los guardias deterministas deben poder
// ACTIVARSE de verdad, no solo existir en el repo.
//
// Motivación (caso real, 2026-07-25): las 33 skills estaban instaladas en la
// máquina del usuario, pero `guardia.mjs` y `sesion.mjs` NUNCA habían corrido.
// El instalador intenta primero el plugin nativo; si la CLI de claude no está
// disponible cae a "modo copia", que instala skills pero no hooks. Y la rama
// de refresco detectaba la instalación previa en copia, copiaba skills y
// volvía — sin reintentar los hooks ni avisar. Resultado: la pieza central de
// la arquitectura (clase 1, determinista) apagada en silencio, indefinidamente,
// mientras la documentación afirmaba que era la ventaja principal del proyecto.
//
// Esta eval fija el arreglo en rojo: activación en settings.json, idempotente,
// preservando la configuración del usuario y respaldando el original.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fallos = [];
const fallo = (m) => fallos.push(m);

const hogar = mkdtempSync(join(tmpdir(), "repofibe-hooks-"));
const rutaSettings = join(hogar, ".claude", "settings.json");
mkdirSync(dirname(rutaSettings), { recursive: true });

// Configuración previa del usuario: debe sobrevivir intacta.
const ORIGINAL = { permissions: { allow: ["Bash(ls)"] }, model: "opus" };
writeFileSync(rutaSettings, JSON.stringify(ORIGINAL, null, 2) + "\n");

const activar = () =>
  spawnSync(process.execPath, [join(RAIZ, "nucleo", "instalar.mjs"), "--hooks"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, USERPROFILE: hogar, HOME: hogar },
  });

// ── 1. Activa los dos hooks ────────────────────────────────────────────────
const r1 = activar();
if (r1.status !== 0) fallo(`--hooks salió ${r1.status}: ${(r1.stderr || r1.stdout).slice(0, 200)}`);

let cfg = JSON.parse(readFileSync(rutaSettings, "utf8"));
if (!cfg.hooks?.PreToolUse?.length) fallo("no registró el hook PreToolUse (guardia determinista)");
if (!cfg.hooks?.SessionStart?.length) fallo("no registró el hook SessionStart");

// El matcher DEBE incluir Skill: sin eso las invocaciones de skills son
// invisibles y no hay dato de uso, que es justo para lo que se cableó la traza.
const matcher = cfg.hooks?.PreToolUse?.[0]?.matcher ?? "";
if (!matcher.includes("Skill")) fallo(`el matcher de PreToolUse no incluye Skill: "${matcher}"`);
if (!/Bash/.test(matcher)) fallo(`el matcher de PreToolUse dejó de cubrir Bash: "${matcher}"`);

// ── 2. La configuración del usuario sobrevive ──────────────────────────────
if (JSON.stringify(cfg.permissions) !== JSON.stringify(ORIGINAL.permissions)) fallo("se perdieron los permisos del usuario");
if (cfg.model !== ORIGINAL.model) fallo("se perdió la preferencia de modelo del usuario");

// ── 3. Idempotente: reinstalar no duplica ──────────────────────────────────
activar();
activar();
cfg = JSON.parse(readFileSync(rutaSettings, "utf8"));
if (cfg.hooks.PreToolUse.length !== 1) fallo(`PreToolUse duplicado tras reinstalar: ${cfg.hooks.PreToolUse.length} entradas`);
if (cfg.hooks.SessionStart.length !== 1) fallo(`SessionStart duplicado tras reinstalar: ${cfg.hooks.SessionStart.length} entradas`);

// ── 4. El respaldo conserva el ORIGINAL, no la última versión ──────────────
const respaldo = `${rutaSettings}.bak-repofibe`;
if (!existsSync(respaldo)) fallo("no se creó respaldo del settings.json del usuario");
else {
  const b = JSON.parse(readFileSync(respaldo, "utf8"));
  if (b.hooks) fallo("el respaldo fue sobrescrito con una versión ya modificada (perdió el original)");
  if (b.model !== ORIGINAL.model) fallo("el respaldo no conserva la configuración original");
}

// ── 5. Un settings.json corrupto NO se toca ────────────────────────────────
const hogar2 = mkdtempSync(join(tmpdir(), "repofibe-hooks-roto-"));
mkdirSync(join(hogar2, ".claude"), { recursive: true });
const roto = join(hogar2, ".claude", "settings.json");
writeFileSync(roto, "{ esto no es json válido");
const r2 = spawnSync(process.execPath, [join(RAIZ, "nucleo", "instalar.mjs"), "--hooks"], {
  encoding: "utf8", timeout: 30000,
  env: { ...process.env, USERPROFILE: hogar2, HOME: hogar2 },
});
if (readFileSync(roto, "utf8") !== "{ esto no es json válido") {
  fallo("modificó un settings.json que no pudo parsear (riesgo de destruir la configuración del usuario)");
}
if (!/no es JSON válido/i.test(r2.stdout + r2.stderr)) fallo("no avisó al encontrar un settings.json corrupto");

rmSync(hogar, { recursive: true, force: true });
rmSync(hogar2, { recursive: true, force: true });

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: hooks activables en settings.json (idempotente, preserva config, respalda original, no toca JSON corrupto)");
