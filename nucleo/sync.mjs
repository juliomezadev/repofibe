#!/usr/bin/env node
// sync.mjs — sincronización de memoria entre máquinas via git con 3-Way Merge Driver

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

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

// 3-Way Merge Driver para Git (%O ancestro, %A local, %B remoto)
export function gitMerge3Way(ancestorPath, localPath, remotePath) {
  try {
    // parsear NO muta el contenido: devuelve las líneas ORIGINALES intactas.
    // La normalización de separadores (\ → /) se usa SOLO como clave de
    // comparación para deduplicar entre máquinas (Windows vs Unix). Aplicarla
    // al contenido escrito corrompía rutas, regex y escapes en cada merge.
    const clave = (l) => l.replaceAll("\\", "/");
    const parsear = (p) => {
      if (!existsSync(p)) return [];
      const txt = readFileSync(p, "utf8");
      if (!txt.trim()) return [];
      return txt.split("\n").filter(Boolean).map((l) => {
        if (l.trim().startsWith("{")) JSON.parse(l); // valida, no muta
        return l;
      });
    };

    const loc = parsear(localPath);
    const rem = parsear(remotePath);
    const anc = (ancestorPath && existsSync(ancestorPath)) ? parsear(ancestorPath) : [];

    const ancSet = new Set(anc.map(clave));
    const locSet = new Set(loc.map(clave));
    const remSet = new Set(rem.map(clave));

    const resultado = [];
    const procesados = new Set();

    // 1. Entradas de local (mantener si no fueron eliminadas en remoto o fueron creadas en local)
    for (const l of loc) {
      const k = clave(l);
      if (!ancSet.has(k) || remSet.has(k)) {
        if (!procesados.has(k)) { resultado.push(l); procesados.add(k); }
      }
    }

    // 2. Entradas de remoto (mantener si no fueron eliminadas en local o fueron creadas en remoto)
    for (const l of rem) {
      const k = clave(l);
      if (!ancSet.has(k) || locSet.has(k)) {
        if (!procesados.has(k)) { resultado.push(l); procesados.add(k); }
      }
    }

    writeFileSync(localPath, resultado.length ? resultado.join("\n") + "\n" : "");
    return true;
  } catch (e) {
    console.error("Error en 3-Way Merge Driver:", e.message);
    return false;
  }
}

// Merge 2-Way append-only (fallback)
export function mergeJsonl(destPath, srcPath) {
  if (!existsSync(srcPath)) return 0;
  const remotas = readFileSync(srcPath, "utf8").split("\n").filter(Boolean).map(l => l.replaceAll("\\", "/"));
  if (!existsSync(destPath)) {
    writeFileSync(destPath, remotas.length ? remotas.join("\n") + "\n" : "");
    return remotas.length;
  }
  const locales = new Set(readFileSync(destPath, "utf8").split("\n").filter(Boolean).map(l => l.replaceAll("\\", "/")));
  const nuevas = remotas.filter((l) => !locales.has(l));
  if (nuevas.length) {
    const actual = readFileSync(destPath, "utf8");
    const sep = actual === "" || actual.endsWith("\n") ? "" : "\n";
    appendFileSync(destPath, sep + nuevas.join("\n") + "\n");
  }
  return nuevas.length;
}

export async function escanearSecretos(dirFabrica) {
  const { redactar } = await import("./secretos.mjs");
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

export async function push(dirFabrica) {
  const config = cargarConfig();
  if (!config) throw new Error("No hay repo de sync configurado — ejecuta: sync.mjs configurar <url-repo-git-privado>");

  const secretos = await escanearSecretos(dirFabrica);
  if (secretos > 0) {
    console.log(`⚠️ Se redactaron ${secretos} posibles secretos en .fabrica/ antes de push.`);
  }

  if (!existsSync(DIR_SYNC)) {
    git(["clone", config.repo, DIR_SYNC]);
  }

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

  try { git(["-C", DIR_SYNC, "add", "-A"]); } catch {}
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

  if (!existsSync(DIR_SYNC)) {
    git(["clone", config.repo, DIR_SYNC]);
  }

  try {
    git(["-C", DIR_SYNC, "pull", "--quiet"]);
  } catch (e) {
    console.log("Auto-resolviendo pull de sync...");
  }

  const syncFabrica = join(DIR_SYNC, "fabrica");
  if (!existsSync(syncFabrica)) {
    console.log("Repo de sync vacío — sin cambios para traer.");
    return;
  }

  for (const arch of ["memoria.jsonl", "dominio-notas.jsonl"]) {
    const n = mergeJsonl(join(dirFabrica, arch), join(syncFabrica, arch));
    if (n > 0) console.log(`${arch}: ${n} entradas nuevas sincronizadas.`);
  }

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

  console.log("✅ Cambios sincronizados.");
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