#!/usr/bin/env node
// Identidad reproducible de los archivos runtime de una distribución Repofibe.
// El manifiesto vive en la raíz del artefacto o de la instalación, fuera del
// conjunto de archivos que identifica, para evitar hashes autorreferentes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ESQUEMA_DISTRIBUCION = 1;
export const NOMBRE_MANIFIESTO = "distribucion.json";
export const RUTAS_REQUERIDAS = Object.freeze([
  "VERSION",
  "FILOSOFIA.md",
  "package.json",
  "package-lock.json",
  "nucleo/distribucion.mjs",
  "nucleo/ejecutar-seguro.mjs",
  "nucleo/modo-ligero.mjs",
  "nucleo/agentes-git.mjs",
  "nucleo/diagnostico.mjs",
  "nucleo/instalar.mjs",
  "hooks/guardia.mjs",
  "hooks/codex/guardia.mjs",
  "hooks/codex/hooks.json",
  "hooks/sesion.mjs",
  "plantillas/preambulo.md",
  ".codex-plugin/plugin.json",
]);

const RAIZ_MODULO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAICES_PRODUCTO = Object.freeze([
  "FILOSOFIA.md", "VERSION", "package.json", "package-lock.json",
  ".claude-plugin", ".codex-plugin", "hooks", "nucleo", "plantillas", "skills",
]);
const EXCLUIDOS = new Set([
  "hooks/antivirus-hook.mjs",
  "nucleo/antivirus.mjs",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizarRuta(ruta) {
  return ruta.replaceAll("\\", "/").replace(/^\.\//, "");
}

function rutaProducto(ruta) {
  const normalizada = normalizarRuta(ruta);
  return RAICES_PRODUCTO.some((raiz) =>
    normalizada === raiz || normalizada.startsWith(`${raiz}/`));
}

function listarRutasVersionadas(raiz) {
  let stdout;
  try {
    stdout = execFileSync("git", ["-C", raiz, "ls-files", "--cached", "-z", "--", ...RAICES_PRODUCTO], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    throw new Error(`No se pudo enumerar el contenido versionado de la distribución: ${e.message}`);
  }
  const rutas = stdout.split("\0").filter(Boolean).map(normalizarRuta)
    .filter((ruta) => rutaProducto(ruta) && !EXCLUIDOS.has(ruta));
  // Durante desarrollo, los módulos nuevos requeridos pueden existir antes
  // de su primer commit. Se incluyen por nombre fijo; nunca se hace un barrido
  // indiscriminado de archivos no versionados.
  for (const ruta of RUTAS_REQUERIDAS) {
    if (!rutas.includes(ruta) && existsSync(join(raiz, ...ruta.split("/")))) rutas.push(ruta);
  }
  if (!rutas.length) throw new Error("El checkout no contiene archivos versionados de distribución");
  return [...new Set(rutas)].sort();
}

function leerIdentidadGit(raiz) {
  try {
    const commit = execFileSync("git", ["-C", raiz, "rev-parse", "HEAD"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error("SHA de commit inválido");
    return commit;
  } catch (e) {
    throw new Error(`No se pudo determinar el commit de la distribución: ${e.message}`);
  }
}

function verificarCheckoutLimpio(raiz, rutas) {
  let diffLimpio = true;
  try {
    execFileSync("git", ["-C", raiz, "diff", "--quiet", "HEAD", "--", ...rutas], {
      stdio: "ignore",
    });
  } catch {
    diffLimpio = false;
  }
  let indexLimpio = true;
  for (const ruta of rutas) {
    try {
      execFileSync("git", ["-C", raiz, "ls-files", "--error-unmatch", "--", ruta], { stdio: "ignore" });
    } catch { indexLimpio = false; }
  }
  return diffLimpio && indexLimpio;
}

function validarForma(manifiesto) {
  if (!manifiesto || typeof manifiesto !== "object" || Array.isArray(manifiesto)) {
    throw new Error("Manifiesto de distribución inválido");
  }
  if (manifiesto.esquema !== ESQUEMA_DISTRIBUCION) throw new Error("Esquema de distribución no compatible");
  if (typeof manifiesto.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][\w.-]+)?$/.test(manifiesto.version)) {
    throw new Error("Versión inválida en el manifiesto de distribución");
  }
  if (typeof manifiesto.commit !== "string" || !/^[0-9a-f]{40,64}$/i.test(manifiesto.commit)) {
    throw new Error("Commit inválido en el manifiesto de distribución");
  }
  if (typeof manifiesto.arbolLimpio !== "boolean") throw new Error("El manifiesto debe indicar si el árbol coincide con el commit");
  if (!Array.isArray(manifiesto.archivos) || !manifiesto.archivos.length) {
    throw new Error("El manifiesto no contiene archivos");
  }
  const vistos = new Set();
  for (const entrada of manifiesto.archivos) {
    if (!entrada || typeof entrada.ruta !== "string" || typeof entrada.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(entrada.sha256)) {
      throw new Error("Entrada de archivo inválida en el manifiesto");
    }
    const ruta = normalizarRuta(entrada.ruta);
    if (ruta !== entrada.ruta || ruta.startsWith("/") || ruta.split("/").some((p) => !p || p === "." || p === "..") || !rutaProducto(ruta)) {
      throw new Error(`Ruta de distribución no permitida: ${entrada.ruta}`);
    }
    if (EXCLUIDOS.has(ruta)) throw new Error(`El manifiesto contiene un archivo experimental excluido: ${ruta}`);
    if (vistos.has(ruta)) throw new Error(`Ruta duplicada en el manifiesto: ${ruta}`);
    vistos.add(ruta);
  }
  for (const ruta of RUTAS_REQUERIDAS) {
    if (!vistos.has(ruta)) throw new Error(`Falta un archivo obligatorio de distribución: ${ruta}`);
  }
  return manifiesto;
}

export function leerManifiesto(archivo) {
  try {
    return validarForma(JSON.parse(readFileSync(archivo, "utf8")));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`JSON de distribución inválido: ${e.message}`);
    throw e;
  }
}

export function crearManifiesto(raiz = RAIZ_MODULO, { exigirLimpio = false } = {}) {
  const base = resolve(raiz);
  const rutas = listarRutasVersionadas(base);
  const arbolLimpio = verificarCheckoutLimpio(base, rutas);
  if (exigirLimpio && !arbolLimpio) {
    throw new Error("El artefacto solo se genera desde un commit limpio con todos sus archivos versionados");
  }
  const version = readFileSync(join(base, "VERSION"), "utf8").trim();
  const commit = leerIdentidadGit(base);
  const archivos = rutas.map((ruta) => {
    const absoluta = resolve(base, ...ruta.split("/"));
    const st = lstatSync(absoluta);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error(`La distribución requiere archivos regulares: ${ruta}`);
    return { ruta, sha256: sha256(readFileSync(absoluta)) };
  });
  return validarForma({ esquema: ESQUEMA_DISTRIBUCION, version, commit, arbolLimpio, archivos });
}

export function verificarArchivos(raiz, manifiesto) {
  const base = resolve(raiz);
  const m = validarForma(manifiesto);
  const faltantes = [];
  const modificados = [];
  for (const entrada of m.archivos) {
    const ruta = resolve(base, ...entrada.ruta.split("/"));
    const relativo = relative(base, ruta);
    if (relativo === ".." || relativo.startsWith(`..${sep}`)) {
      faltantes.push(entrada.ruta);
      continue;
    }
    try {
      const st = lstatSync(ruta);
      if (!st.isFile() || st.isSymbolicLink()) {
        faltantes.push(entrada.ruta);
        continue;
      }
      if (sha256(readFileSync(ruta)) !== entrada.sha256) modificados.push(entrada.ruta);
    } catch (e) {
      if (e.code === "ENOENT") faltantes.push(entrada.ruta);
      else throw e;
    }
  }
  return { faltantes, modificados };
}

export function resolverManifiesto(raiz = RAIZ_MODULO) {
  const base = resolve(raiz);
  const enDisco = join(base, NOMBRE_MANIFIESTO);
  if (existsSync(enDisco)) return leerManifiesto(enDisco);
  return crearManifiesto(base);
}

export function escribirManifiesto(raiz, destino) {
  const manifiesto = crearManifiesto(raiz, { exigirLimpio: true });
  const ruta = resolve(destino);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(manifiesto, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifiesto;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--generar" && args[1]) {
      const manifiesto = escribirManifiesto(RAIZ_MODULO, args[1]);
      process.stdout.write(`${JSON.stringify({ estado: "generado", ruta: resolve(args[1]), version: manifiesto.version, commit: manifiesto.commit })}\n`);
    } else if (args[0] === "--verificar" && args[1]) {
      const manifiesto = leerManifiesto(join(resolve(args[1]), NOMBRE_MANIFIESTO));
      const resultado = verificarArchivos(args[1], manifiesto);
      process.stdout.write(`${JSON.stringify({ estado: resultado.faltantes.length ? "incompleta" : resultado.modificados.length ? "modificada" : "coherente", ...resultado })}\n`);
      if (resultado.faltantes.length || resultado.modificados.length) process.exitCode = 1;
    } else {
      process.stderr.write("Uso: node nucleo/distribucion.mjs --generar <ruta/distribucion.json> | --verificar <directorio>\n");
      process.exitCode = 2;
    }
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
