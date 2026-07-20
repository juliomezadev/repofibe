#!/usr/bin/env node
// sync.mjs — sincronización de memoria entre máquinas via git
//
// El modelo anterior dijo "merge de JSONL no pensado". La solución es
// simple porque los JSONL de repofibe son APPEND-ONLY: nunca se edita
// una línea existente, solo se agrega. Eso hace git merge trivial
// (no hay conflictos de contenido real, solo concurrencia de appends
// que git resuelve automáticamente porque las líneas son independientes).
//
// Flujo:
//   sync.mjs push → escanea secretos, empuja .fabrica/ al repo de sync
//   sync.mjs pull → trae cambios del repo, merge ff-only
//
// REPO_SYNC: repo git privado donde se sincroniza .fabrica/. Se configura
// con sync.mjs configurar <url-repo>. Las entradas de memoria, dominio,
// y auth se sincronizan — nunca el código del proyecto (eso ya tiene su
// propio repo).
//
// Escáner de secretos (secretos.mjs) corre ANTES de push para evitar
// que credenciales o tokens se publiquen accidentalmente.

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const RAIZ = import.meta.dirname;
const CONFIG_FILE = join(homedir(), ".repofibe", "sync-config.json");
const DIR_SYNC = join(homedir(), ".repofibe", "sync-repo");

function git(args, cwd) {
  return execFileSync("git", args, { encoding: "utf8", cwd, timeout: 15000 });
}

function cargarConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
}

function guardarConfig(config) {
  mkdirSync(join(homedir(), ".repofibe"), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Merge append-only de dos JSONL. Dedup por LÍNEA COMPLETA, no por campo
// `id`: memoria.jsonl no tiene `id` (solo dominio-notas.jsonl lo tiene), así
// que dedup por id duplicaría cada entrada de memoria en cada pull. La línea
// completa es el identificador correcto para logs append-only escritos por
// la misma herramienta. Devuelve cuántas líneas nuevas se agregaron.
export function mergeJsonl(destPath, srcPath) {
  if (!existsSync(srcPath)) return 0;
  const remotas = readFileSync(srcPath, "utf8").split("\n").filter(Boolean);
  if (!existsSync(destPath)) {
    writeFileSync(destPath, remotas.length ? remotas.join("\n") + "\n" : "");
    return remotas.length;
  }
  const locales = new Set(readFileSync(destPath, "utf8").split("\n").filter(Boolean));
  const nuevas = remotas.filter((l) => !locales.has(l));
  if (nuevas.length) {
    const actual = readFileSync(destPath, "utf8");
    const sep = actual === "" || actual.endsWith("\n") ? "" : "\n";
    appendFileSync(destPath, sep + nuevas.join("\n") + "\n");
  }
  return nuevas.length;
}

async function escanearSecretos(dirFabrica) {
  const { redactar } = await import("./secretos.mjs");
  // Escanear archivos JSONL en .fabrica/
  const archivos = ["memoria.jsonl", "dominio-notas.jsonl"];
  let encontrados = 0;
  for (const arch of archivos) {
    const ruta = join(dirFabrica, arch);
    if (!existsSync(ruta)) continue;
    const contenido = readFileSync(ruta, "utf8");
    const resultado = redactar(contenido);
    if (resultado.hallazgos.length > 0) {
      writeFileSync(ruta, resultado.texto);
      encontrados += resultado.hallazgos.reduce((s, h) => s + h.cantidad, 0);
    }
  }
  // Escanear auth states (cookies)
  const authDir = join(dirFabrica, "auth");
  if (existsSync(authDir)) {
    for (const arch of readdirSyncList(authDir)) {
      if (!arch.endsWith(".json")) continue;
      const ruta = join(authDir, arch);
      const contenido = readFileSync(ruta, "utf8");
      const resultado = redactar(contenido);
      if (resultado.hallazgos.length > 0) {
        writeFileSync(ruta, resultado.texto);
        encontrados += resultado.hallazgos.reduce((s, h) => s + h.cantidad, 0);
      }
    }
  }
  return encontrados;
}

function readdirSyncList(dir) {
  try { return readdirSync(dir); }
  catch { return []; }
}

async function push(dirFabrica) {
  const config = cargarConfig();
  if (!config) throw new Error("No hay repo de sync configurado — ejecuta: sync.mjs configurar <url-repo-git-privado>");

  // Escanear secretos ANTES de push
  const secretos = await escanearSecretos(dirFabrica);
  if (secretos > 0) {
    console.log(`⚠️ Se redactaron ${secretos} posibles secretos en .fabrica/ antes de push.`);
  }

  // Preparar repo de sync
  if (!existsSync(DIR_SYNC)) {
    git(["clone", config.repo, DIR_SYNC]);
  }

  // Copiar .fabrica/ al repo de sync (solo JSONL y auth, no perfiles temporales)
  const syncFabrica = join(DIR_SYNC, "fabrica");
  mkdirSync(syncFabrica, { recursive: true });

  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    const src = join(dirFabrica, arch);
    if (existsSync(src)) {
      writeFileSync(join(syncFabrica, arch), readFileSync(src, "utf8"));
    }
  }

  const authDir = join(dirFabrica, "auth");
  const syncAuthDir = join(syncFabrica, "auth");
  if (existsSync(authDir)) {
    mkdirSync(syncAuthDir, { recursive: true });
    for (const arch of readdirSyncList(authDir)) {
      if (arch.endsWith(".json") && !arch.startsWith("perfil")) {
        writeFileSync(join(syncAuthDir, arch), readFileSync(join(authDir, arch), "utf8"));
      }
    }
  }

  // Commit y push en el repo de sync
  try { git(["-C", DIR_SYNC, "add", "-A"]); } catch { /* sin cambios */ }
  try {
    git(["-C", DIR_SYNC, "commit", "-m", `sync push: ${new Date().toISOString()}`]);
    git(["-C", DIR_SYNC, "push"]);
    console.log(`✅ .fabrica/ sincronizado (${secretos > 0 ? `${secretos} secretos redactados, ` : ""}0 conflictos — JSONL append-only)`);
  } catch (e) {
    // Sin cambios para commitear → sync limpio
    if (e.message?.includes("nothing to commit")) {
      console.log("Sin cambios nuevos para sincronizar.");
    } else throw e;
  }
}

async function pull(dirFabrica) {
  const config = cargarConfig();
  if (!config) throw new Error("No hay repo de sync configurado — ejecuta: sync.mjs configurar <url-repo-git-privado>");

  if (!existsSync(DIR_SYNC)) {
    git(["clone", config.repo, DIR_SYNC]);
  }

  // Pull ff-only en el repo de sync
  git(["-C", DIR_SYNC, "pull", "--ff-only"]);

  // Copiar desde repo de sync a .fabrica/ local (APPEND: merge manual)
  const syncFabrica = join(DIR_SYNC, "fabrica");
  if (!existsSync(syncFabrica)) {
    console.log("Repo de sync vacío — sin cambios para traer.");
    return;
  }

  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    const n = mergeJsonl(join(dirFabrica, arch), join(syncFabrica, arch));
    if (n > 0) console.log(`${arch}: ${n} entradas nuevas sincronizadas.`);
  }

  // Auth states (reemplazar, no append — son snapshots, no logs)
  const syncAuthDir = join(syncFabrica, "auth");
  const localAuthDir = join(dirFabrica, "auth");
  if (existsSync(syncAuthDir)) {
    mkdirSync(localAuthDir, { recursive: true });
    for (const arch of readdirSyncList(syncAuthDir)) {
      if (arch.endsWith(".json") && !arch.startsWith("perfil")) {
        writeFileSync(join(localAuthDir, arch), readFileSync(join(syncAuthDir, arch), "utf8"));
      }
    }
  }

  console.log("✅ Cambios sincronizados (pull ff-only, merge append-only sin conflictos).");
}

function configurar(repoUrl) {
  guardarConfig({ repo: repoUrl, configurado: new Date().toISOString() });
  console.log(`Repo de sync configurado: ${repoUrl}`);
  console.log("Los datos de .fabrica/ se sincronizarán con ese repo privado.");
  console.log("Escaneo de secretos automático antes de cada push.");
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const dirFabrica = join(process.cwd(), ".fabrica");

  if (cmd === "push") {
    await push(dirFabrica);
  } else if (cmd === "pull") {
    await pull(dirFabrica);
  } else if (cmd === "configurar" && args[0]) {
    configurar(args[0]);
  } else {
    console.log("Uso:");
    console.log("  sync.mjs push                     → escanea secretos, empuja .fabrica/ al repo privado");
    console.log("  sync.mjs pull                      → trae cambios (ff-only, merge append-only)");
    console.log("  sync.mjs configurar <url-repo>     → configura el repo git privado de sync");
    console.log("\nLos JSONL de repofibe son append-only: merge sin conflictos, solo appends concurrentes.");
    process.exit(1);
  }
}

export { push, pull, configurar, escanearSecretos, cargarConfig };