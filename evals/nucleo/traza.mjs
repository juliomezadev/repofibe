#!/usr/bin/env node
// evals/nucleo/traza.mjs — verifica la telemetría local de repofibe.
//
// Cubre las tres reglas del módulo, ejecutándolas de verdad:
//   A. Nunca se escribe contenido, solo metadatos (lista blanca).
//   B. Importar traza.mjs no cambia el comportamiento del proceso.
//   C. Todo falla en silencio: los hooks siguen siendo fail-open.
//
// Trabaja SIEMPRE contra un directorio temporal. La versión anterior escribía
// en el .fabrica del repo real cada vez que corría la suite.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "repofibe-traza-"));
process.env.REPOFIBE_TRAZA_DIR = tmp; // redirige withTrace fuera del repo real

const { withTrace, flushSyncEmergencia, registrar, rutaTraza, resumirUso, instalarRedDeSeguridad } =
  await import("../../nucleo/traza.mjs");

const fallos = [];
const fallo = (m) => fallos.push(m);
const leer = (raiz = tmp) => {
  const a = rutaTraza(raiz);
  return existsSync(a) ? readFileSync(a, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

// ── Regla B: importar no debe instalar handlers que secuestren el proceso ────
// Este era el bug que hacía peligroso cablear la traza a un hook fail-open:
// el handler de uncaughtException forzaba exit 1 en el proceso anfitrión.
{
  if (process.listenerCount("uncaughtException") > 0) {
    fallo("importar traza.mjs instaló un handler de uncaughtException (rompe el fail-open de los hooks)");
  }
  for (const sig of ["SIGINT", "SIGTERM"]) {
    if (process.listenerCount(sig) > 0) fallo(`importar traza.mjs instaló un handler de ${sig}`);
  }
  instalarRedDeSeguridad();
  if (process.listenerCount("uncaughtException") !== 1) {
    fallo("instalarRedDeSeguridad() no instaló el handler opt-in");
  }
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  console.log("  ok: importar no secuestra el proceso; la red de seguridad es opt-in");
}

// ── withTrace: anidación y propagación de contexto ──────────────────────────
{
  const hija = withTrace("Subtarea", async (falla) => {
    await new Promise((r) => setTimeout(r, 10));
    if (falla) throw new Error("fallo simulado");
    return "ok";
  });
  const padre = withTrace("Flujo", async () => {
    await hija(false);
    try { await hija(true); } catch {}
  });
  await padre();
  flushSyncEmergencia();

  const spans = leer().filter((e) => e.tId);
  const raiz = spans.find((s) => s.n === "Flujo");
  const hijos = spans.filter((s) => s.n === "Subtarea");
  if (!raiz || hijos.length !== 2) fallo(`se esperaban 1 padre y 2 hijos, hay ${spans.length} spans`);
  else if (!hijos.every((h) => h.pId === raiz.sId)) fallo("la anidación padre/hijo no se propagó");
  else if (hijos.filter((h) => h.st === 1).length !== 1) fallo("no se marcó el span fallido con st=1");
  else console.log("  ok: withTrace anida, propaga contexto y marca el fallo");
}

// ── Regla A: lista blanca — el contenido NUNCA llega al disco ───────────────
{
  const SECRETO = "sk-ant-api03-CREDENCIAL-QUE-NO-DEBE-PERSISTIR";
  registrar({
    ev: "herramienta",
    n: "Bash",
    command: `export TOKEN=${SECRETO}`,      // campo no permitido
    file_path: "/home/usuario/.ssh/id_rsa",  // campo no permitido
    prompt: "texto del usuario",             // campo no permitido
  }, { raiz: tmp });

  const crudo = readFileSync(rutaTraza(tmp), "utf8");
  if (crudo.includes(SECRETO)) fallo("FUGA: el valor de un campo no permitido se escribió a disco");
  else if (crudo.includes("id_rsa") || crudo.includes("texto del usuario")) fallo("FUGA: campo no permitido persistido");
  else {
    const ultimo = leer().at(-1);
    if (ultimo.n !== "Bash" || ultimo.ev !== "herramienta") fallo("no se registró el metadato permitido");
    else if ("command" in ultimo || "file_path" in ultimo || "prompt" in ultimo) fallo("campos no permitidos presentes en el evento");
    else console.log("  ok: lista blanca — se registra la herramienta, jamás su contenido");
  }
}

// ── Truncado: ni siquiera un campo permitido puede crecer sin límite ────────
{
  registrar({ ev: "herramienta", n: "X".repeat(500) }, { raiz: tmp });
  const ultimo = leer().at(-1);
  if (ultimo.n.length > 80) fallo(`campo permitido sin truncar: ${ultimo.n.length} caracteres`);
  else console.log("  ok: los campos permitidos se truncan (80 caracteres)");
}

// ── Apagado por configuración del usuario ───────────────────────────────────
{
  const apagado = mkdtempSync(join(tmpdir(), "repofibe-traza-off-"));
  mkdirSync(join(apagado, ".fabrica"), { recursive: true });
  writeFileSync(join(apagado, ".fabrica", "traza.json"), JSON.stringify({ activo: false }));

  const escribio = registrar({ ev: "herramienta", n: "Bash" }, { raiz: apagado });
  if (escribio || existsSync(rutaTraza(apagado))) fallo("la traza escribió estando apagada en traza.json");
  else console.log("  ok: se apaga con .fabrica/traza.json → {activo:false}");
  rmSync(apagado, { recursive: true, force: true });
}

// ── Regla C: si no puede escribir, no lanza ────────────────────────────────
{
  const roto = mkdtempSync(join(tmpdir(), "repofibe-traza-roto-"));
  writeFileSync(join(roto, ".fabrica"), "esto es un archivo, no un directorio");
  let lanzo = false;
  let r;
  try { r = registrar({ ev: "herramienta", n: "Bash" }, { raiz: roto }); } catch { lanzo = true; }
  if (lanzo) fallo("registrar() lanzó cuando no pudo escribir (debe fallar en silencio)");
  else if (r !== false) fallo("registrar() no reportó el fallo de escritura");
  else console.log("  ok: si no puede escribir, devuelve false sin lanzar");
  rmSync(roto, { recursive: true, force: true });
}

// ── El hook real: registra Y sigue protegiendo ─────────────────────────────
function correrGuardia(payload, cwd) {
  return spawnSync(process.execPath, [join(RAIZ, "hooks", "guardia.mjs")], {
    input: JSON.stringify({ ...payload, cwd }), encoding: "utf8", timeout: 15000,
  });
}

{
  const casa = mkdtempSync(join(tmpdir(), "repofibe-guardia-"));

  // 1. Invocación de skill → se registra con el nombre de la skill.
  const rSkill = correrGuardia({ tool_name: "Skill", tool_input: { skill: "legal" } }, casa);
  if (rSkill.status !== 0) fallo(`guardia.mjs salió ${rSkill.status} en una invocación de skill`);

  // 2. Comando destructivo → sigue pidiendo confirmación: la telemetría no
  //    puede haber debilitado la protección que es la razón de ser del hook.
  const rDestructivo = correrGuardia({ tool_name: "Bash", tool_input: { command: "rm -rf /tmp/algo" } }, casa);
  let decision = null;
  try { decision = JSON.parse(rDestructivo.stdout).hookSpecificOutput.permissionDecision; } catch {}
  if (decision !== "ask") fallo(`el guardia dejó de pedir confirmación ante rm -rf (decisión: ${decision})`);
  if (rDestructivo.status !== 0) fallo("guardia.mjs no salió 0 tras pedir confirmación");

  const eventos = leer(casa);
  const skill = eventos.find((e) => e.ev === "skill" && e.n === "legal");
  const bash = eventos.find((e) => e.ev === "herramienta" && e.n === "Bash");
  if (!skill) fallo("el hook no registró la invocación de skill (sin eso no hay dato de uso)");
  else if (!bash || bash.d !== "ask") fallo("el hook no registró la decisión del guardia");
  else if (readFileSync(rutaTraza(casa), "utf8").includes("rm -rf")) fallo("FUGA: el comando del usuario quedó escrito en la traza");
  else console.log("  ok: el hook registra uso y decisión, sigue protegiendo, y no escribe el comando");

  // 3. Fail-open: con la traza imposibilitada, el guardia debe seguir intacto.
  const casaRota = mkdtempSync(join(tmpdir(), "repofibe-guardia-roto-"));
  writeFileSync(join(casaRota, ".fabrica"), "archivo donde debería ir el directorio");
  const rRoto = correrGuardia({ tool_name: "Bash", tool_input: { command: "git reset --hard" } }, casaRota);
  let decisionRota = null;
  try { decisionRota = JSON.parse(rRoto.stdout).hookSpecificOutput.permissionDecision; } catch {}
  if (rRoto.status !== 0 || decisionRota !== "ask") {
    fallo(`con la traza rota el guardia dejó de funcionar (status ${rRoto.status}, decisión ${decisionRota})`);
  } else console.log("  ok: con la traza imposibilitada el guardia sigue protegiendo (fail-open)");

  // 4. El resumen de uso agrega lo registrado.
  const uso = resumirUso(casa);
  if (!uso.length || !uso.some((u) => u.n === "legal")) fallo("resumirUso() no agrega los eventos del hook");
  else console.log("  ok: resumirUso() agrega el uso real registrado por el hook");

  rmSync(casa, { recursive: true, force: true });
  rmSync(casaRota, { recursive: true, force: true });
}

rmSync(tmp, { recursive: true, force: true });

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: telemetría local verificada (metadatos sin contenido, apagable, fail-open, hook cableado)");
