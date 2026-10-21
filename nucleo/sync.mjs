#!/usr/bin/env node
// sync.mjs — sincronización de memoria entre máquinas via git con 3-Way Merge Driver

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { conBloqueoExclusivoSync, escribirAtomicoSync } from "./persistencia.mjs";

const SYNC_HOME = process.env.REPOFIBE_SYNC_HOME || homedir();
const DIR_REPOFIBE = join(SYNC_HOME, ".repofibe");
const CONFIG_FILE = join(DIR_REPOFIBE, "sync-config.json");
const DIR_SYNC = join(DIR_REPOFIBE, "sync-repo");

function lstatOpcional(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function exigirDirectorioReal(path, etiqueta, opcional = false) {
  const info = lstatOpcional(path);
  if (!info && opcional) return false;
  if (!info || info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Sync seguro: ${etiqueta} debe ser un directorio real, sin symlinks ni junctions.`);
  }
  return true;
}

function exigirArchivoJsonlSeguro(path, etiqueta, opcional = false) {
  const info = lstatOpcional(path);
  if (!info && opcional) return false;
  if (!info || info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Sync seguro: ${etiqueta} debe ser un archivo regular, sin symlinks.`);
  }
  return true;
}

function validarArbolRepoSync() {
  exigirDirectorioReal(DIR_REPOFIBE, "la carpeta .repofibe");
  exigirDirectorioReal(DIR_SYNC, "la raíz del repo espejo");
  const dirFabrica = join(DIR_SYNC, "fabrica");
  if (!exigirDirectorioReal(dirFabrica, "fabrica del espejo", true)) return false;
  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    exigirArchivoJsonlSeguro(join(dirFabrica, arch), `fabrica/${arch}`, true);
  }
  return true;
}

function git(args, cwd) {
  return execFileSync("git", args, { encoding: "utf8", cwd, timeout: 15000 });
}

function clonarRepoSync(repo) {
  // El override debe aplicarse durante el checkout inicial, antes de persistirlo
  // en .git/config; cambiarlo después deja el JSONL con CRLF y el índice sucio.
  git(["-c", "core.autocrlf=false", "clone", repo, DIR_SYNC]);
}

function gitBytes(args) {
  return execFileSync("git", args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
}

function configurarRepoSync() {
  validarArbolRepoSync();
  // Convierte solo checkouts cuya única diferencia sea CRLF de autocrlf; una
  // edición real en el espejo se conserva y detiene el sync para evitar pérdida.
  const rutas = git(["-C", DIR_SYNC, "ls-files", "--", "fabrica/memoria.jsonl", "fabrica/dominio-notas.jsonl"])
    .split("\n").filter(Boolean);
  const staged = rutas.length
    ? git(["-C", DIR_SYNC, "diff", "--cached", "--name-only", "HEAD", "--", ...rutas]).trim()
    : "";
  if (staged) throw new Error(`Sync espejo con cambios staged en ${staged}; no se normalizan datos locales.`);

  const normalizar = [];
  for (const ruta of rutas) {
    const path = join(DIR_SYNC, ruta);
    exigirArchivoJsonlSeguro(path, `fabrica/${ruta}`);
    let head;
    try { head = gitBytes(["-C", DIR_SYNC, "show", `HEAD:${ruta}`]); }
    catch { throw new Error(`Sync espejo sin blob HEAD para ${ruta}; no se normalizan datos locales.`); }
    const actual = readFileSync(path);
    if (actual.equals(head)) continue;
    const crlf = Buffer.from(head.toString("utf8").replace(/\r?\n/g, "\r\n"), "utf8");
    if (!actual.equals(crlf)) {
      throw new Error(`Sync espejo con cambios locales fuera de finales de línea en ${ruta}; no se normalizan datos locales.`);
    }
    normalizar.push([path, head]);
  }

  // Este espejo transporta líneas JSONL byte a byte; autocrlf alteraría los
  // terminadores del checkout y haría que el merge las interpretara como nuevas.
  git(["-C", DIR_SYNC, "config", "core.autocrlf", "false"]);
  for (const [path, bytes] of normalizar) {
    validarArbolRepoSync();
    exigirArchivoJsonlSeguro(path, path);
    escribirAtomicoSync(path, bytes);
  }
}

function textoErrorGit(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .map((valor) => Buffer.isBuffer(valor) ? valor.toString("utf8") : String(valor))
    .join("\n");
}

export function clasificarErrorSync(error, { conflicto = false } = {}) {
  const salida = textoErrorGit(error);
  if (conflicto || /conflict|unmerged|merge failed/i.test(salida)) return "conflicto";
  if (/repository .*not found|does not appear to be a git repository|no such remote|remote .*does not exist/i.test(salida)) return "remoto-inexistente";
  if (/authentication failed|could not read from remote|permission denied|access denied|invalid username|terminal prompts disabled/i.test(salida)) return "autenticacion";
  if (/could not resolve host|connection .*failed|connection timed out|timed out|network is unreachable|unable to access/i.test(salida)) return "red";
  return "error-git";
}

function errorSync(codigo, error) {
  const fallo = new Error(`Sync pull falló (${codigo}): ${textoErrorGit(error).trim() || "git devolvió un error"}`);
  fallo.codigo = codigo;
  fallo.syncSuccess = false;
  fallo.causa = error;
  return fallo;
}

function commitActual() {
  try { return git(["-C", DIR_SYNC, "rev-parse", "HEAD"]).trim(); }
  catch { return null; }
}

function tieneConflictos() {
  try { return Boolean(git(["-C", DIR_SYNC, "diff", "--name-only", "--diff-filter=U"]).trim()); }
  catch { return false; }
}

function cargarConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
}

function guardarConfig(config) {
  mkdirSync(join(SYNC_HOME, ".repofibe"), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function leerLineasJsonl(ruta) {
  if (!existsSync(ruta)) return [];
  const texto = readFileSync(ruta, "utf8");
  if (texto === "") return [];
  const lineas = texto.split("\n");
  if (texto.endsWith("\n")) lineas.pop(); // quita solo el terminador final, no líneas internas
  lineas.forEach((linea, indice) => {
    try { JSON.parse(linea); }
    catch (error) { throw new Error(`JSONL inválido en ${ruta}, línea ${indice + 1}: ${error.message}`); }
  });
  return lineas;
}

function serializarLineasJsonl(lineas) {
  return lineas.length ? lineas.join("\n") + "\n" : "";
}

// 3-Way Merge Driver para Git (%O ancestro, %A local, %B remoto)
export function gitMerge3Way(ancestorPath, localPath, remotePath) {
  try {
    return conBloqueoExclusivoSync(`${localPath}.lock`, () => {
      // Cada línea JSONL se valida antes de escribir y se compara exactamente;
      // las barras y escapes son parte de los datos, nunca claves normalizadas.
      const loc = leerLineasJsonl(localPath);
      const rem = leerLineasJsonl(remotePath);
      const anc = ancestorPath ? leerLineasJsonl(ancestorPath) : [];

      const ancSet = new Set(anc);
      const locSet = new Set(loc);
      const remSet = new Set(rem);

      const resultado = [];
      const procesados = new Set();

      // 1. Entradas de local (mantener si no fueron eliminadas en remoto o fueron creadas en local)
      for (const linea of loc) {
        if (!ancSet.has(linea) || remSet.has(linea)) {
          if (!procesados.has(linea)) { resultado.push(linea); procesados.add(linea); }
        }
      }

      // 2. Entradas de remoto (mantener si no fueron eliminadas en local o fueron creadas en remoto)
      for (const linea of rem) {
        if (!ancSet.has(linea) || locSet.has(linea)) {
          if (!procesados.has(linea)) { resultado.push(linea); procesados.add(linea); }
        }
      }

      escribirAtomicoSync(localPath, serializarLineasJsonl(resultado));
      return true;
    });
  } catch (e) {
    console.error("Error en 3-Way Merge Driver:", e.message);
    return false;
  }
}

// Merge 2-Way append-only (fallback)
export function mergeJsonl(destPath, srcPath) {
  if (!existsSync(srcPath)) return 0;
  return conBloqueoExclusivoSync(`${destPath}.lock`, () => {
    // Lee y valida ambos documentos bajo el mismo lock antes de reemplazar el
    // destino; un origen inválido no puede dejar un append parcial.
    const remotas = leerLineasJsonl(srcPath);
    const locales = leerLineasJsonl(destPath);
    const vistas = new Set(locales);
    const nuevas = [];
    for (const linea of remotas) {
      if (!vistas.has(linea)) {
        vistas.add(linea);
        nuevas.push(linea);
      }
    }
    if (nuevas.length) escribirAtomicoSync(destPath, serializarLineasJsonl([...locales, ...nuevas]));
    return nuevas.length;
  });
}

export async function escanearSecretos(dirFabrica) {
  const { redactar } = await import("./secretos.mjs");
  const archivos = ["memoria.jsonl", "dominio-notas.jsonl"];
  let encontrados = 0;
  for (const arch of archivos) {
    const ruta = join(dirFabrica, arch);
    encontrados += conBloqueoExclusivoSync(`${ruta}.lock`, () => {
      if (!existsSync(ruta)) return 0;
      const contenido = readFileSync(ruta, "utf8");
      const resultado = redactar(contenido);
      if (!resultado.hallazgos.length) return 0;
      escribirAtomicoSync(ruta, resultado.texto);
      return resultado.hallazgos.reduce((s, h) => s + h.cantidad, 0);
    });
  }
  return encontrados;
}

export async function push(dirFabrica) {
  const config = cargarConfig();
  if (!config) throw new Error("No hay repo de sync configurado — ejecuta: sync.mjs configurar <url-repo-git-privado>");

  const secretos = await escanearSecretos(dirFabrica);
  if (secretos > 0) {
    console.log(`⚠️ Se redactaron ${secretos} posibles secretos en .fabrica/ antes de push.`);
  }

  exigirDirectorioReal(DIR_REPOFIBE, "la carpeta .repofibe");
  if (!lstatOpcional(DIR_SYNC)) {
    clonarRepoSync(config.repo);
  } else {
    exigirDirectorioReal(DIR_SYNC, "la raíz del repo espejo");
  }
  configurarRepoSync();

  const syncFabrica = join(DIR_SYNC, "fabrica");
  if (!exigirDirectorioReal(syncFabrica, "fabrica del espejo", true)) mkdirSync(syncFabrica);
  exigirDirectorioReal(syncFabrica, "fabrica del espejo");

  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    const src = join(dirFabrica, arch);
    const dest = join(syncFabrica, arch);
    exigirArchivoJsonlSeguro(dest, `fabrica/${arch}`, true);
    if (existsSync(src)) {
      escribirAtomicoSync(dest, readFileSync(src, "utf8"));
      exigirArchivoJsonlSeguro(dest, `fabrica/${arch}`);
    }
  }
  validarArbolRepoSync();

  // Auth nunca entra al Ã­ndice: contiene cookies, storageState y sesiones
  // locales. El reset evita que una copia histÃ³rica de fabrica/auth/ oculte
  // una modificaciÃ³n accidental al usar `git add -A`.
  try { git(["-C", DIR_SYNC, "reset", "--", "fabrica/auth"]); } catch {}
  const permitidos = ["memoria.jsonl", "dominio-notas.jsonl"]
    .filter((arch) => exigirArchivoJsonlSeguro(join(syncFabrica, arch), `fabrica/${arch}`, true))
    .map((arch) => `fabrica/${arch}`);
  if (permitidos.length) {
    try { git(["-C", DIR_SYNC, "add", "-A", "--", ...permitidos]); } catch {}
  }
  try {
    git(["-C", DIR_SYNC, "commit", "-m", `sync push: ${new Date().toISOString()}`]);
    git(["-C", DIR_SYNC, "push"]);
    console.log(`✅ .fabrica/ sincronizado (${secretos > 0 ? `${secretos} secretos redactados, ` : ""}0 conflictos — 3-Way Merge active)`);
  } catch (e) {
    if (e.message?.includes("nothing to commit")) {
      console.log("Sin cambios nuevos para sincronizar.");
    } else if (e.message?.includes("non-fast-forward") || e.message?.includes("fetch first")) {
      console.log("⚡ Reject non-fast-forward detectado. Ejecutando auto-pull de sincronización...");
      await pull(dirFabrica);
      git(["-C", DIR_SYNC, "push"]);
      console.log("✅ Auto-pull & re-push completado exitosamente.");
    } else throw e;
  }
}

export async function pull(dirFabrica) {
  const config = cargarConfig();
  if (!config) throw new Error("No hay repo de sync configurado — ejecuta: sync.mjs configurar <url-repo-git-privado>");

  exigirDirectorioReal(DIR_REPOFIBE, "la carpeta .repofibe");
  if (!lstatOpcional(DIR_SYNC)) {
    try {
      clonarRepoSync(config.repo);
    } catch (e) {
      throw errorSync(clasificarErrorSync(e), e);
    }
  } else {
    exigirDirectorioReal(DIR_SYNC, "la raíz del repo espejo");
  }
  configurarRepoSync();

  const commitAntes = commitActual();
  try {
    git(["-C", DIR_SYNC, "pull", "--no-rebase", "--quiet"]);
  } catch (e) {
    const conflicto = tieneConflictos();
    throw errorSync(clasificarErrorSync(e, { conflicto }), e);
  }
  const commitDespues = commitActual();
  const resultadoPull = commitAntes && commitAntes === commitDespues ? "sin-cambios" : "actualizado";

  const hayFabrica = validarArbolRepoSync();
  const syncFabrica = join(DIR_SYNC, "fabrica");
  if (!hayFabrica) {
    console.log("Repo de sync vacío — sin cambios para traer.");
    return { ok: true, estado: resultadoPull };
  }

  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    const n = mergeJsonl(join(dirFabrica, arch), join(syncFabrica, arch));
    if (n > 0) console.log(`${arch}: ${n} entradas nuevas sincronizadas.`);
  }

  console.log(resultadoPull === "sin-cambios" ? "✅ Sync ya estaba actualizado." : "✅ Cambios sincronizados.");
  return { ok: true, estado: resultadoPull };
}

export function configurar(repoUrl) {
  guardarConfig({ repo: repoUrl, configurado: new Date().toISOString() });
  console.log(`Repo de sync configurado: ${repoUrl}`);
  // Ruta ABSOLUTA a este sync.mjs: git corre el driver desde el toplevel del
  // repo, que puede no ser el checkout de repofibe — una ruta relativa
  // apuntaría a un archivo inexistente. Si el registro falla, se avisa (no se
  // traga en silencio: sin driver, git haría un merge por defecto que puede
  // corromper la memoria).
  try {
    const esteScript = fileURLToPath(import.meta.url).replaceAll("\\", "/");
    execSync('git config --local merge.repofibe-memoria.name "Merge driver para memoria JSONL de Repofibe"');
    execSync(`git config --local merge.repofibe-memoria.driver "node \\"${esteScript}\\" git-merge %O %A %B"`);
    console.log("Merge Driver 3-Way registrado en Git local.");
  } catch (e) {
    console.warn(`AVISO: no se pudo registrar el merge driver (${e.message.split("\n")[0]}).`);
    console.warn("Sin él, git usará el merge por defecto para .fabrica/*.jsonl. Registra manualmente o corre 'configurar' dentro de un repo git.");
  }
}

// CLI Entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const dirFabrica = join(process.cwd(), ".fabrica");

  if (cmd === "git-merge") {
    const [ancestor, local, remote] = args;
    const ok = gitMerge3Way(ancestor, local, remote);
    process.exit(ok ? 0 : 1); // Exit code 1 obliga a Git a marcar el conflicto si hubo corrupción
  } else if (cmd === "push") {
    await push(dirFabrica);
  } else if (cmd === "pull") {
    await pull(dirFabrica);
  } else if (cmd === "configurar" && args[0]) {
    configurar(args[0]);
  } else {
    console.log("Uso:");
    console.log("  sync.mjs push                     → escanea secretos, empuja .fabrica/");
    console.log("  sync.mjs pull                      → trae cambios (3-Way Merge)");
    console.log("  sync.mjs git-merge %O %A %B        → subcomando interno invocable por Git Driver");
    console.log("  sync.mjs configurar <url-repo>     → configura el repo git privado de sync");
    process.exit(1);
  }
}
