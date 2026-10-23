#!/usr/bin/env node
// Motor conservador para PreToolUse y runner local de argv allowlisted.
// No pretende interpretar Bash o PowerShell completos.

import { accessSync, appendFileSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const MAX_STDIN = 256 * 1024;
const MAX_COMMAND = 64 * 1024;
const DESTRUCTIVOS = [
  /\bgit(?:\.exe)?\s+reset\b/i,
  /\bgit(?:\.exe)?\s+clean\b/i,
  /\bgit(?:\.exe)?\s+branch\s+-D\b/i,
  /\bgit(?:\.exe)?\s+(?:push|merge|rebase)\b/i,
  /\bgit(?:\.exe)?\s+(?:checkout|restore)\s+(?:--\s+)?\.\s*$/i,
  /\brm\b/i,
  /\b(?:Remove-Item|del|erase|rmdir|rd)\b/i,
  /\b(?:format|diskpart|mkfs(?:\.\w+)?|shred|truncate)\b/i,
  /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i,
  /\b(?:Remove-Item|del|erase|rmdir|rd)\b[^\r\n]*(?:-Recurse|-Force|\/s|\/q)/i,
];
const ARCHIVOS_POLITICA = new Set([
  "hooks/codex/hooks.json",
  "hooks/codex/guardia.mjs",
  "nucleo/ejecutar-seguro.mjs",
  ".codex-plugin/plugin.json",
  "plugin.json",
]);

const HASH = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const fallo = (code, reason, tool = null) => ({ decision: "deny", code, reason, tool });
const permitir = (code, reason, tool = null) => ({ decision: "allow", code, reason, tool });

function objetoPlano(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function esDentro(base, objetivo) {
  const rel = relative(base, objetivo);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function inspeccionarComponentes(ruta, { permitirFinalAusente = false } = {}) {
  const absoluta = resolve(ruta);
  const raiz = parse(absoluta).root;
  const partes = absoluta.slice(raiz.length).split(sep).filter(Boolean);
  let cursor = raiz;
  let existentes = 0;
  for (const parte of partes) {
    cursor = join(cursor, parte);
    try {
      const info = lstatSync(cursor);
      if (info.isSymbolicLink()) return { ok: false, code: "SYMLINK", reason: "La ruta contiene un enlace o junction." };
      existentes += 1;
    } catch (error) {
      if (error.code === "ENOENT" && permitirFinalAusente) return { ok: true, existe: false, ruta: absoluta, existenteMasCercano: dirname(cursor) };
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return { ok: false, code: "PATH_MISSING", reason: "La ruta requerida no existe." };
      return { ok: false, code: "PATH_UNREADABLE", reason: "No se pudo inspeccionar la ruta de forma segura." };
    }
  }
  try {
    return { ok: true, existe: true, ruta: realpathSync.native(absoluta), existentes };
  } catch {
    return { ok: false, code: "PATH_UNREADABLE", reason: "No se pudo resolver la ruta física." };
  }
}

function raizValidada(cwd) {
  if (typeof cwd !== "string" || !cwd.trim() || !isAbsolute(cwd) || cwd.includes("\0")) {
    return { ok: false, error: fallo("INVALID_CWD", "El evento no contiene un cwd absoluto válido.") };
  }
  const inspeccion = inspeccionarComponentes(cwd);
  if (!inspeccion.ok) return { ok: false, error: fallo(inspeccion.code, `No se puede validar el límite del repositorio: ${inspeccion.reason}`) };
  try {
    accessSync(inspeccion.ruta, fsConstants.R_OK);
    return { ok: true, ruta: inspeccion.ruta };
  } catch {
    return { ok: false, error: fallo("PERMISSION_DENIED", "No hay permiso de lectura para el directorio del repositorio.") };
  }
}

function resolverRaiz(base, valor) {
  if (typeof valor !== "string" || !valor.trim() || valor.includes("\0")) {
    return { ok: false, error: fallo("INVALID_PATH", "La ruta de destino está vacía o malformada.") };
  }
  if (isAbsolute(valor) || /^[A-Za-z]:/.test(valor) || /^[\\/]{2}/.test(valor) || (process.platform === "win32" && valor.includes(":"))) {
    return { ok: false, error: fallo("OUT_OF_SCOPE", "Solo se admiten rutas relativas dentro del repositorio actual.") };
  }
  const partes = valor.split(/[\\/]+/);
  if (partes.some((parte) => parte === "..") || partes.some((parte) => parte === "")) {
    return { ok: false, error: fallo("OUT_OF_SCOPE", "La ruta intenta salir del repositorio o no es canónica.") };
  }
  const destino = resolve(base, valor);
  if (!esDentro(base, destino) || destino === base) {
    return { ok: false, error: fallo("OUT_OF_SCOPE", "El destino queda fuera del repositorio autorizado.") };
  }
  return { ok: true, ruta: destino };
}

function validarDestinoPatch(base, valor, clase) {
  const resuelto = resolverRaiz(base, valor);
  if (!resuelto.ok) return resuelto.error;
  const inspeccion = inspeccionarComponentes(resuelto.ruta, { permitirFinalAusente: clase === "Add" });
  if (!inspeccion.ok) return fallo(inspeccion.code, inspeccion.reason);
  if (clase === "Update" && !inspeccion.existe) return fallo("TARGET_MISSING", "No se puede actualizar un archivo inexistente.");
  if (clase === "Add" && inspeccion.existe) return fallo("TARGET_EXISTS", "No se puede añadir un archivo que ya existe.");
  const padre = clase === "Add" ? dirname(resuelto.ruta) : dirname(inspeccion.ruta);
  const inspeccionPadre = inspeccionarComponentes(padre);
  if (!inspeccionPadre.ok) return fallo(inspeccionPadre.code, inspeccionPadre.reason);
  try {
    accessSync(clase === "Update" ? inspeccion.ruta : inspeccionPadre.ruta, fsConstants.W_OK);
    return null;
  } catch {
    return fallo("PERMISSION_DENIED", "No hay permiso de escritura en el destino o su directorio padre.");
  }
}

function evaluarPatch(base, comando) {
  if (typeof comando !== "string" || !comando.length || comando.length > MAX_COMMAND || comando.includes("\0")) {
    return fallo("MALFORMED_INPUT", "apply_patch requiere un comando textual válido.", "apply_patch");
  }
  const lineas = comando.replace(/\r\n/g, "\n").split("\n");
  while (lineas.length > 1 && lineas.at(-1) === "") lineas.pop();
  if (lineas[0] !== "*** Begin Patch" || lineas.at(-1) !== "*** End Patch") {
    return fallo("MALFORMED_PATCH", "El formato de apply_patch no coincide con el contrato reconocido.", "apply_patch");
  }
  const cambios = [];
  for (const linea of lineas.slice(1, -1)) {
    if (/^\*\*\*\s+Delete File:/.test(linea)) {
      return fallo("DESTRUCTIVE_PATCH", "La eliminación de archivos queda bloqueada por esta guardia.", "apply_patch");
    }
    if (/^\*\*\*\s+Move to:/.test(linea)) {
      return fallo("UNSUPPORTED_PATCH", "Los movimientos de archivos requieren revisión fuera de esta guardia.", "apply_patch");
    }
    const match = linea.match(/^\*\*\*\s+(Update|Add) File:\s*(.+)$/);
    if (match) {
      cambios.push({ clase: match[1], ruta: match[2].trim() });
      continue;
    }
    if (/^\*\*\*\s+/.test(linea) && !/^\*\*\*\s+(?:End of File|[0-9]+(?:,[0-9]+)?\s+@@)/.test(linea)) {
      return fallo("MALFORMED_PATCH", "El parche contiene una directiva no reconocida.", "apply_patch");
    }
  }
  if (!cambios.length) return fallo("MALFORMED_PATCH", "El parche no declara archivos que modificar.", "apply_patch");
  const vistos = new Set();
  for (const cambio of cambios) {
    const destino = resolverRaiz(base, cambio.ruta);
    if (!destino.ok) return { ...destino.error, tool: "apply_patch" };
    const rutaRelativa = relative(base, destino.ruta).replace(/\\/g, "/");
    const llavePolitica = process.platform === "win32" ? rutaRelativa.toLowerCase() : rutaRelativa;
    if (ARCHIVOS_POLITICA.has(llavePolitica)) {
      return fallo("POLICY_SELF_MODIFICATION", "La guardia no permite cambiar su propio hook, motor ni manifiesto Codex desde la sesión controlada.", "apply_patch");
    }
    const canonica = process.platform === "win32" ? destino.ruta.toLowerCase() : destino.ruta;
    if (vistos.has(canonica)) return fallo("MALFORMED_PATCH", "El parche repite un destino.", "apply_patch");
    vistos.add(canonica);
    const error = validarDestinoPatch(base, cambio.ruta, cambio.clase);
    if (error) return { ...error, tool: "apply_patch" };
  }
  return permitir("PATCH_IN_SCOPE", `${cambios.length} destino(s) relativo(s) inspeccionado(s) dentro del repositorio.`, "apply_patch");
}

function rutaTrabajo(base, workdir) {
  if (workdir === undefined || workdir === null || workdir === "") return { ok: true, ruta: base };
  if (typeof workdir !== "string" || workdir.includes("\0")) return { ok: false, error: fallo("INVALID_WORKDIR", "El workdir está malformado.", "Bash") };
  const propuesta = isAbsolute(workdir) ? resolve(workdir) : resolve(base, workdir);
  if (!esDentro(base, propuesta)) return { ok: false, error: fallo("OUT_OF_SCOPE", "El workdir de Bash queda fuera del repositorio actual.", "Bash") };
  const inspeccion = inspeccionarComponentes(propuesta);
  if (!inspeccion.ok) return { ok: false, error: fallo(inspeccion.code, `El workdir no es seguro: ${inspeccion.reason}`, "Bash") };
  try {
    accessSync(inspeccion.ruta, fsConstants.R_OK);
    return { ok: true, ruta: inspeccion.ruta };
  } catch {
    return { ok: false, error: fallo("PERMISSION_DENIED", "No hay permiso de lectura para el workdir.", "Bash") };
  }
}

function evaluarBash(base, toolInput) {
  if (typeof toolInput.command !== "string" || !toolInput.command.trim() || toolInput.command.length > MAX_COMMAND || toolInput.command.includes("\0")) {
    return fallo("MALFORMED_INPUT", "Bash requiere un comando textual válido.", "Bash");
  }
  const cwd = rutaTrabajo(base, toolInput.workdir);
  if (!cwd.ok) return cwd.error;
  const command = toolInput.command.trim();
  if (DESTRUCTIVOS.some((patron) => patron.test(command))) {
    return fallo("DESTRUCTIVE_COMMAND", "Se bloqueó un patrón destructivo reconocido; no se ejecutó el comando.", "Bash");
  }

  const ubicacionGit = command.match(/\bgit(?:\.exe)?\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
  if (ubicacionGit) {
    const ruta = ubicacionGit[1] ?? ubicacionGit[2] ?? ubicacionGit[3];
    const destino = isAbsolute(ruta) ? resolve(ruta) : resolve(cwd.ruta, ruta);
    if (!esDentro(base, destino)) return fallo("OUT_OF_SCOPE", "git -C intenta operar fuera del repositorio actual.", "Bash");
  }
  if (/\b(?:cd|Set-Location)\b/i.test(command)) {
    return fallo("UNSUPPORTED_SHELL", "No se interpreta navegación de shell; use el workdir validado del evento.", "Bash");
  }

  // Allowlist de comandos con sintaxis literal. Cualquier shell compuesto,
  // wrapper, redirección, variable, ruta o comando no reconocido falla
  // cerrado; no se usa un parser incompleto de Bash/PowerShell.
  const plan = prepararComandoSeguro(command, cwd.ruta);
  if (plan?.tipo === "TEST_COMMAND") {
    return permitir("TEST_COMMAND", "Node ejecutará archivos .test/.spec explícitos bajo tests/ o evals/; el código del test puede producir efectos dentro de sus permisos.", "Bash");
  }
  if (plan) {
    return permitir("READ_ONLY_COMMAND", "Comando literal de inspección en un workdir dentro del repositorio.", "Bash");
  }
  return fallo("COMMAND_NOT_ALLOWED", "Comando fuera de la allowlist conservadora; requiere decisión por el mecanismo normal de Codex.", "Bash");
}

function prepararComandoSeguro(command, cwd) {
  if (/^(?:node|node\.exe) --version$/i.test(command)) {
    return { tipo: "READ_ONLY_COMMAND", binario: process.execPath, args: ["--version"], cwd };
  }
  if (/^(?:git|git\.exe) status --short$/i.test(command)) {
    const binario = process.platform === "win32" ? "git.exe" : "git";
    return {
      tipo: "READ_ONLY_COMMAND",
      binario,
      args: ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "status", "--short"],
      cwd,
    };
  }
  if (/^(?:git|git\.exe) diff --check$/i.test(command)) {
    const binario = process.platform === "win32" ? "git.exe" : "git";
    return {
      tipo: "READ_ONLY_COMMAND",
      binario,
      args: ["-c", "core.fsmonitor=false", "diff", "--check", "--no-ext-diff", "--no-textconv"],
      cwd,
    };
  }
  const testMatch = command.match(/^node(?:\.exe)? --test ((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+(?:\s+(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+)*)$/i);
  if (!testMatch) return null;
  const rutas = testMatch[1].split(/\s+/);
  const absolutas = [];
  for (const ruta of rutas) {
    if (!/^(?:tests|evals)\//i.test(ruta) || !/\.(?:test|spec)\.(?:mjs|js|cjs)$/i.test(ruta)) return null;
    const destino = resolverRaiz(cwd, ruta);
    if (!destino.ok) return null;
    const inspeccion = inspeccionarComponentes(destino.ruta);
    if (!inspeccion.ok || !inspeccion.existe) return null;
    try { accessSync(inspeccion.ruta, fsConstants.R_OK); } catch { return null; }
    absolutas.push(relative(cwd, inspeccion.ruta));
  }
  return { tipo: "TEST_COMMAND", binario: process.execPath, args: ["--test", ...absolutas], cwd };
}

function rutaLogSegura(logPath) {
  if (typeof logPath !== "string" || !logPath.trim() || !isAbsolute(logPath) || logPath.includes("\0")) return null;
  const baseTemp = realpathSync.native(tmpdir());
  const destino = resolve(logPath);
  if (!esDentro(baseTemp, destino) || destino === baseTemp) return null;
  const inspeccionPadre = inspeccionarComponentes(dirname(destino));
  if (!inspeccionPadre.ok) return null;
  try {
    const info = lstatSync(destino);
    if (info.isSymbolicLink() || !info.isFile()) return null;
  } catch (error) {
    if (error.code !== "ENOENT") return null;
  }
  return destino;
}

function registrarEvidencia(resultado, entrada, env) {
  const destino = rutaLogSegura(env.REPOFIBE_GUARD_LOG);
  if (!destino) {
    return env.REPOFIBE_GUARD_LOG
      ? fallo("LOG_PATH_INVALID", "REPOFIBE_GUARD_LOG debe ser un archivo explícito dentro de la carpeta temporal del sistema.", resultado.tool)
      : resultado;
  }
  const fila = {
    at: new Date().toISOString(),
    tool: resultado.tool,
    decision: resultado.decision,
    code: resultado.code,
    cwdHash: HASH(entrada?.cwd ?? ""),
    inputHash: HASH(JSON.stringify(entrada ?? null)),
  };
  try {
    mkdirSync(dirname(destino), { recursive: true });
    appendFileSync(destino, `${JSON.stringify(fila)}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
    return resultado;
  } catch {
    return fallo("LOG_FAILURE", "No se pudo escribir la evidencia configurada; la decisión se deniega por seguridad.", resultado.tool);
  }
}

export function evaluarEntrada(texto, { env = process.env } = {}) {
  if (typeof texto !== "string" || !texto.length || texto.length > MAX_STDIN) {
    return registrarEvidencia(fallo("MALFORMED_INPUT", "La entrada JSON está vacía o excede el límite admitido."), null, env);
  }
  let entrada;
  try { entrada = JSON.parse(texto); }
  catch { return registrarEvidencia(fallo("MALFORMED_INPUT", "La entrada del hook no es JSON válido."), null, env); }
  if (!objetoPlano(entrada) || entrada.hook_event_name !== "PreToolUse" || !objetoPlano(entrada.tool_input)) {
    return registrarEvidencia(fallo("MALFORMED_INPUT", "Se requiere un evento PreToolUse con tool_input objeto."), entrada, env);
  }
  const raiz = raizValidada(entrada.cwd);
  if (!raiz.ok) return registrarEvidencia(raiz.error, entrada, env);
  let resultado;
  if (entrada.tool_name === "Bash") resultado = evaluarBash(raiz.ruta, entrada.tool_input);
  else if (entrada.tool_name === "apply_patch") resultado = evaluarPatch(raiz.ruta, entrada.tool_input.command);
  else resultado = fallo("TOOL_NOT_SUPPORTED", "La herramienta no está cubierta por esta política; no se autoriza desde este hook.", String(entrada.tool_name ?? ""));
  return registrarEvidencia(resultado, entrada, env);
}

export function respuestaCodex(resultado) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: resultado.decision,
      permissionDecisionReason: `REPOFIBE-GUARD[${resultado.code}]: ${resultado.reason}`,
    },
  };
}

// Ejecutor opcional de máxima restricción para pipelines locales de REPOFIBE.
// Solo ejecuta binarios y argv producidos por la allowlist, siempre shell:false.
export function ejecutarControlado(texto, { env = process.env } = {}) {
  let entrada;
  try { entrada = JSON.parse(texto); }
  catch { return { ...fallo("MALFORMED_INPUT", "La entrada no es JSON válido."), exitCode: 2, stdout: "", stderr: "" }; }
  if (entrada.tool_name !== "Bash") {
    const denegada = fallo("RUNNER_UNSUPPORTED_TOOL", "El ejecutor solo admite comandos Bash literales de inspección o pruebas locales.", String(entrada.tool_name ?? ""));
    return { ...denegada, exitCode: 2, stdout: "", stderr: denegada.reason };
  }
  const decision = evaluarEntrada(texto, { env });
  if (decision.decision !== "allow") return { ...decision, exitCode: 2, stdout: "", stderr: decision.reason };
  const raiz = raizValidada(entrada.cwd);
  if (!raiz.ok) return { ...raiz.error, exitCode: 2, stdout: "", stderr: raiz.error.reason };
  const workdir = rutaTrabajo(raiz.ruta, entrada.tool_input?.workdir);
  if (!workdir.ok) return { ...workdir.error, exitCode: 2, stdout: "", stderr: workdir.error.reason };
  const plan = prepararComandoSeguro(entrada.tool_input.command.trim(), workdir.ruta);
  if (!plan) {
    const denegada = fallo("RUNNER_COMMAND_NOT_ALLOWED", "El comando no tiene una forma ejecutable en la allowlist de argv.", "Bash");
    return { ...denegada, exitCode: 2, stdout: "", stderr: denegada.reason };
  }
  const envSeguro = { ...env };
  for (const nombre of [
    "NODE_OPTIONS", "NODE_PATH", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR",
    "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM",
  ]) delete envSeguro[nombre];
  envSeguro.GIT_CONFIG_NOSYSTEM = "1";
  envSeguro.GIT_PAGER = "cat";
  envSeguro.PAGER = "cat";
  const ejecucion = spawnSync(plan.binario, plan.args, {
    cwd: plan.cwd,
    env: envSeguro,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (ejecucion.error || ejecucion.signal) {
    const error = fallo("EXECUTION_FAILED", "El comando permitido no terminó correctamente; no se reintenta.", "Bash");
    return { ...error, exitCode: 2, stdout: ejecucion.stdout ?? "", stderr: ejecucion.stderr ?? error.reason };
  }
  return {
    ...decision,
    exitCode: ejecucion.status ?? 2,
    stdout: ejecucion.stdout ?? "",
    stderr: ejecucion.stderr ?? "",
  };
}

async function leerEntrada() {
  const bloques = [];
  let total = 0;
  for await (const bloque of process.stdin) {
    total += bloque.length;
    if (total > MAX_STDIN) throw new Error("stdin excede el límite de 256 KiB");
    bloques.push(bloque);
  }
  return Buffer.concat(bloques).toString("utf8");
}

async function principal() {
  let resultado;
  try {
    const texto = await leerEntrada();
    if (process.argv[2] === "--ejecutar") {
      resultado = ejecutarControlado(texto);
      if (resultado.decision !== "allow") process.stderr.write(`${resultado.code}: ${resultado.reason}\n`);
      else if (resultado.stderr) process.stderr.write(resultado.stderr);
      if (resultado.stdout) process.stdout.write(resultado.stdout);
      process.exitCode = resultado.exitCode;
      return;
    }
    resultado = evaluarEntrada(texto);
  } catch { resultado = fallo("INTERNAL_ERROR", "No se pudo evaluar el evento; se deniega por seguridad."); }
  process.stdout.write(`${JSON.stringify(respuestaCodex(resultado))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await principal();
}
