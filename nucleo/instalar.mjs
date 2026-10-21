#!/usr/bin/env node
// instalar.mjs - instalador multi-host de repofibe.
//
// Las copias se registran archivo por archivo. La desinstalacion solo elimina
// un archivo si repofibe lo creo y su contenido no cambio desde la instalacion.
// Las carpetas se limpian unicamente cuando quedaron vacias.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  unlinkSync,
  rmdirSync,
  chmodSync,
  readdirSync,
  lstatSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { NOMBRE_MANIFIESTO, resolverManifiesto, verificarArchivos } from "./distribucion.mjs";
import { diagnosticarInstalacion } from "./diagnostico.mjs";

// Ejecuta sin shell. En Windows los CLIs de npm son shims .cmd.
function ejecutar(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  } catch (e) {
    if (process.platform === "win32" && (e.code === "ENOENT" || e.code === "EINVAL")) {
      return execFileSync(cmd + ".cmd", args, { stdio: "pipe", encoding: "utf8" });
    } else {
      throw e;
    }
  }
}

function jsonFinal(salida) {
  const ultima = String(salida).trim().split(/\r?\n/).at(-1);
  try { return JSON.parse(ultima); }
  catch { throw new Error("La CLI no devolvio JSON valido en la ultima linea"); }
}

function listarMarketplacesClaude() {
  const lista = JSON.parse(ejecutar("claude", ["plugin", "marketplace", "list", "--json"]));
  if (!Array.isArray(lista) || lista.some((m) => !m || typeof m.name !== "string" || typeof m.source !== "string")) {
    throw new Error("la lista de marketplaces tiene un formato desconocido");
  }
  return lista;
}

function listarPluginsClaude() {
  const lista = JSON.parse(ejecutar("claude", ["plugin", "list", "--json"]));
  if (!Array.isArray(lista) || lista.some((p) => !p || typeof p.id !== "string")) {
    throw new Error("la lista de plugins tiene un formato desconocido");
  }
  return lista;
}

const MARKETPLACE_REPOFIBE = "repofibe-marketplace";
const PLUGIN_REPOFIBE = `repofibe@${MARKETPLACE_REPOFIBE}`;

function rutaIgual(a, b) {
  const normalizar = (ruta) => resolve(ruta).replace(/[\\/]+/g, sep).toLocaleLowerCase("en-US");
  return typeof a === "string" && normalizar(a) === normalizar(b);
}

function marketplaceRepoFibe(marketplace) {
  return marketplace?.name === MARKETPLACE_REPOFIBE && marketplace.source === "directory" &&
    typeof marketplace.path === "string" && rutaIgual(marketplace.path, RAIZ);
}

function resultadoClaudeJson(salida, comando) {
  const resultado = jsonFinal(salida);
  if (!resultado || resultado.command !== comando || !["ok", "failed"].includes(resultado.outcome) || typeof resultado.message !== "string") {
    throw new Error(`la respuesta JSON de ${comando} tiene un formato desconocido`);
  }
  return resultado;
}

function pluginsDeMarketplace(plugins, nombre) {
  return plugins.filter((plugin) => plugin.id.endsWith(`@${nombre}`));
}

function compensarPluginClaude() {
  let errorComando = null;
  try {
    const resultado = resultadoClaudeJson(ejecutar("claude", ["plugin", "uninstall", PLUGIN_REPOFIBE, "--scope", "user", "--json"]), "uninstall");
    if (resultado.outcome !== "ok") errorComando = new Error(resultado.message);
  } catch (e) {
    errorComando = e;
  }
  const quedan = listarPluginsClaude().some((plugin) => plugin.id === PLUGIN_REPOFIBE && plugin.scope === "user");
  if (quedan) throw new Error(`el plugin ${PLUGIN_REPOFIBE} sigue instalado en scope user${errorComando ? `: ${errorComando.message}` : ""}`);
}

function compensarMarketplaceClaude() {
  const plugins = listarPluginsClaude();
  const asociados = pluginsDeMarketplace(plugins, MARKETPLACE_REPOFIBE);
  if (asociados.length) {
    throw new Error(`se conserva ${MARKETPLACE_REPOFIBE}: quedan plugins instalados (${asociados.map((p) => p.id).join(", ")})`);
  }
  let errorComando = null;
  try {
    const resultado = resultadoClaudeJson(ejecutar("claude", ["plugin", "marketplace", "remove", MARKETPLACE_REPOFIBE, "--scope", "user", "--json"]), "marketplace-remove");
    if (resultado.outcome !== "ok") errorComando = new Error(resultado.message);
  } catch (e) {
    errorComando = e;
  }
  const queda = listarMarketplacesClaude().some((marketplace) => marketplace.name === MARKETPLACE_REPOFIBE);
  if (queda) throw new Error(`no se pudo confirmar la retirada del marketplace ${MARKETPLACE_REPOFIBE}${errorComando ? `: ${errorComando.message}` : ""}`);
}

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOGAR = homedir();
const APP = join(HOGAR, ".repofibe", "app");
const REGISTRO = join(HOGAR, ".repofibe", "instalado.json");
const MARCA_INICIO = "<!-- repofibe:inicio -->";
const MARCA_FIN = "<!-- repofibe:fin -->";
const LEGADO_ANTIVIRUS = 'node "C:/Users/mesw/Desktop/proyecto Repofibe 5/repofibe/hooks/antivirus-hook.mjs"';
let manifiestoFuente = null;
let transaccion = null;

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : null; };
const hostPedido = flag("--host");
const workspace = flag("--workspace");
const quitar = args.includes("--quitar");
const refrescar = args.includes("--refrescar");
const adoptar = args.includes("--adoptar");
const dryRun = args.includes("--dry-run");
const soloHooks = args.includes("--hooks");

if (dryRun) {
  console.log("=== EJECUCIÓN EN MODO DRY-RUN ===");
}

function existe(ruta) {
  try { lstatSync(ruta); return true; } catch { return false; }
}

function claveRuta(ruta) {
  const absoluta = resolve(ruta);
  return process.platform === "win32" ? absoluta.toLowerCase() : absoluta;
}

function rutaDentro(ruta, base) {
  const r = claveRuta(ruta);
  const b = claveRuta(base);
  return r === b || r.startsWith(b.endsWith(sep) ? b : b + sep);
}

function hashTexto(texto) {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function hashArchivo(ruta) {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

function directoriosPadreSeguros(ruta) {
  let actual = dirname(resolve(ruta));
  while (true) {
    try {
      const st = lstatSync(actual);
      if (!st.isDirectory() || st.isSymbolicLink()) return false;
    } catch {
      return false;
    }
    const padre = dirname(actual);
    if (padre === actual) return true;
    actual = padre;
  }
}

function archivoRegularSinEnlaces(ruta) {
  try {
    const st = lstatSync(ruta);
    return st.isFile() && !st.isSymbolicLink() && directoriosPadreSeguros(ruta);
  } catch {
    return false;
  }
}

function directorioSinEnlaces(ruta) {
  try {
    const st = lstatSync(ruta);
    return st.isDirectory() && !st.isSymbolicLink() && directoriosPadreSeguros(ruta);
  } catch {
    return false;
  }
}

function recordarAntesDeEscribir(ruta) {
  if (!transaccion) return;
  const absoluta = resolve(ruta);
  const llave = claveRuta(absoluta);
  if (transaccion.archivos.has(llave)) return;
  try {
    const st = lstatSync(absoluta);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error(`No se puede respaldar una ruta no regular: ${absoluta}`);
    transaccion.archivos.set(llave, {
      ruta: absoluta,
      existe: true,
      bytes: readFileSync(absoluta),
      modo: st.mode & 0o777,
      despues: null,
      tocado: false,
    });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    transaccion.archivos.set(llave, { ruta: absoluta, existe: false, bytes: null, modo: null, despues: null, tocado: false });
  }
}

function registrarEscritura(ruta) {
  if (!transaccion) return;
  const item = transaccion.archivos.get(claveRuta(resolve(ruta)));
  if (!item) return;
  item.tocado = true;
  item.despues = existe(ruta) ? hashArchivo(ruta) : null;
}

function revertirTransaccion() {
  if (!transaccion) return;
  for (const compensar of [...transaccion.compensaciones].reverse()) {
    try { compensar(); }
    catch (e) { console.warn(`  compensacion externa incompleta: ${e.message}`); }
  }
  for (const item of [...transaccion.archivos.values()].reverse()) {
    if (!item.tocado) continue;
    try {
      const presente = existe(item.ruta);
      if (presente && !archivoRegularSinEnlaces(item.ruta)) {
        console.warn(`  rollback omitido: la ruta o uno de sus padres ya no es un archivo regular sin enlaces: ${item.ruta}`);
        continue;
      }
      const actual = presente ? hashArchivo(item.ruta) : null;
      if (actual !== item.despues) {
        console.warn(`  rollback omitido por cambio concurrente: ${item.ruta}`);
        continue;
      }
      if (!directoriosPadreSeguros(item.ruta)) {
        console.warn(`  rollback omitido: directorio padre ausente o inseguro: ${item.ruta}`);
        continue;
      }
      if (item.existe) {
        const temporal = `${item.ruta}.tmp-rollback-${process.pid}`;
        try {
          if (!directoriosPadreSeguros(item.ruta)) throw new Error("directorio padre inseguro");
          writeFileSync(temporal, item.bytes, { flag: "wx" });
          chmodSync(temporal, item.modo);
          if (!directoriosPadreSeguros(item.ruta)) throw new Error("directorio padre inseguro");
          renameSync(temporal, item.ruta);
        } finally {
          try { if (archivoRegularSinEnlaces(temporal)) unlinkSync(temporal); } catch {}
        }
      } else if (actual !== null) {
        if (!archivoRegularSinEnlaces(item.ruta) || hashArchivo(item.ruta) !== item.despues) {
          console.warn(`  rollback omitido por cambio concurrente: ${item.ruta}`);
          continue;
        }
        unlinkSync(item.ruta);
      }
    } catch (e) {
      console.warn(`  rollback incompleto en ${item.ruta}: ${e.message}`);
    }
  }
  for (const dir of [...transaccion.directorios].reverse()) {
    try {
      if (directorioSinEnlaces(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
      else if (existe(dir)) console.warn(`  rollback omitió directorio no vacío o inseguro: ${dir}`);
    } catch {}
  }
}

function ejecutarConRollback(fn) {
  if (dryRun) return fn();
  if (transaccion) return fn();
  transaccion = { archivos: new Map(), directorios: [], compensaciones: [] };
  try {
    const marcador = join(HOGAR, ".repofibe", "en-actualizacion.json");
    const directorioMarcador = dirname(marcador);
    if (!existe(directorioMarcador)) {
      const faltantes = [];
      let actual = directorioMarcador;
      while (!existe(actual)) {
        faltantes.push(actual);
        const padre = dirname(actual);
        if (padre === actual) throw new Error(`No se pudo resolver el padre de ${actual}`);
        actual = padre;
      }
      for (const dir of faltantes.reverse()) {
        mkdirSync(dir);
        transaccion.directorios.push(dir);
      }
    }
    const manifiesto = obtenerManifiestoFuente();
    recordarAntesDeEscribir(marcador);
    writeFileSync(marcador, `${JSON.stringify({ version: manifiesto.version, commit: manifiesto.commit, iniciado: new Date().toISOString() })}\n`, "utf8");
    registrarEscritura(marcador);
    const resultado = fn();
    unlinkSync(marcador);
    registrarEscritura(marcador);
    transaccion = null;
    return resultado;
  } catch (e) {
    revertirTransaccion();
    transaccion = null;
    throw e;
  }
}

function obtenerManifiestoFuente() {
  if (manifiestoFuente) return manifiestoFuente;
  const manifiesto = resolverManifiesto(RAIZ);
  if (manifiesto.version !== readFileSync(join(RAIZ, "VERSION"), "utf8").trim()) {
    throw new Error("La versión del checkout no coincide con el manifiesto de distribución");
  }
  const verificacion = verificarArchivos(RAIZ, manifiesto);
  if (verificacion.faltantes.length || verificacion.modificados.length) {
    throw new Error(`El checkout no coincide con su manifiesto: ${verificacion.faltantes.length} faltante(s), ${verificacion.modificados.length} modificado(s)`);
  }
  manifiestoFuente = manifiesto;
  return manifiestoFuente;
}

function registroBase() {
  return {
    version: 2,
    rutas: [],
    bloques: [],
    archivos: [],
    bloquesPropios: [],
    directorios: [],
    destinos: [],
    plugins: [],
  };
}

function leerRegistro() {
  let bruto = null;
  try { bruto = JSON.parse(readFileSync(REGISTRO, "utf8")); } catch {}
  const registro = { ...registroBase(), ...(bruto && typeof bruto === "object" ? bruto : {}) };
  registro.rutas = Array.isArray(registro.rutas) ? registro.rutas.filter((r) => typeof r === "string") : [];
  registro.bloques = Array.isArray(registro.bloques) ? registro.bloques.filter((r) => typeof r === "string") : [];
  registro.archivos = Array.isArray(registro.archivos)
    ? registro.archivos.filter((r) => r && typeof r.ruta === "string" && typeof r.sha256 === "string")
    : [];
  registro.bloquesPropios = Array.isArray(registro.bloquesPropios)
    ? registro.bloquesPropios.filter((r) => r && typeof r.ruta === "string" && typeof r.sha256 === "string")
    : [];
  registro.directorios = Array.isArray(registro.directorios) ? registro.directorios.filter((r) => typeof r === "string") : [];
  registro.destinos = Array.isArray(registro.destinos) ? registro.destinos.filter((r) => typeof r === "string") : [];
  registro.plugins = Array.isArray(registro.plugins) ? registro.plugins.filter((r) => typeof r === "string") : [];
  registro.version = 2;
  registro._legacy = !bruto || bruto.version !== 2 || !Array.isArray(bruto.archivos);
  return registro;
}

function guardarRegistro(registro) {
  if (dryRun) {
    console.log(`[DRY-RUN] write ${REGISTRO}`);
    return;
  }
  mkdirSync(dirname(REGISTRO), { recursive: true });
  const serializable = { ...registro };
  delete serializable._legacy;
  const temporal = `${REGISTRO}.tmp-${process.pid}`;
  recordarAntesDeEscribir(REGISTRO);
  try {
    writeFileSync(temporal, JSON.stringify(serializable, null, 2) + "\n", "utf8");
    renameSync(temporal, REGISTRO);
    registrarEscritura(REGISTRO);
  } catch (e) {
    try { unlinkSync(temporal); } catch {}
    throw e;
  }
}

function anotar(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.rutas.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.rutas.push(absoluta);
}

function anotarDestino(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.destinos.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.destinos.push(absoluta);
}

function anotarDirectorio(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.directorios.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.directorios.push(absoluta);
}

// Crea solo los directorios ausentes y los registra para poder limpiar vacios.
function asegurarDirectorio(registro, ruta) {
  const objetivo = resolve(ruta);
  const faltantes = [];
  let actual = objetivo;
  while (true) {
    try {
      const st = lstatSync(actual);
      if (!st.isDirectory()) throw new Error(`La ruta no es un directorio: ${actual}`);
      break;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      faltantes.push(actual);
      const padre = dirname(actual);
      if (padre === actual) throw new Error(`No se pudo resolver el padre de ${actual}`);
      actual = padre;
    }
  }
  for (const dir of faltantes.reverse()) {
    if (!dryRun) mkdirSync(dir); else console.log("[DRY-RUN] mkdir", dir);
    anotarDirectorio(registro, dir);
    if (!dryRun && transaccion) transaccion.directorios.push(dir);
  }
}

function registrarArchivo(registro, ruta, sha256) {
  const absoluta = resolve(ruta);
  const existente = registro.archivos.find((r) => claveRuta(r.ruta) === claveRuta(absoluta));
  if (existente) {
    existente.ruta = absoluta;
    existente.sha256 = sha256;
  } else {
    registro.archivos.push({ ruta: absoluta, sha256 });
  }
}

function buscarArchivo(registro, ruta) {
  return registro.archivos.find((r) => claveRuta(r.ruta) === claveRuta(ruta));
}

function registrarBloque(registro, ruta, sha256, creado) {
  const absoluta = resolve(ruta);
  const existente = registro.bloquesPropios.find((r) => claveRuta(r.ruta) === claveRuta(absoluta));
  if (existente) {
    existente.ruta = absoluta;
    existente.sha256 = sha256;
    existente.creado = existente.creado || creado;
  } else {
    registro.bloquesPropios.push({ ruta: absoluta, sha256, creado });
  }
  if (!registro.bloques.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.bloques.push(absoluta);
}

function buscarBloque(registro, ruta) {
  return registro.bloquesPropios.find((r) => claveRuta(r.ruta) === claveRuta(ruta));
}

function esRutaLegacy(registro, ruta) {
  return registro._legacy && registro.rutas.some((base) => rutaDentro(ruta, base));
}

function copiarArchivoSeguro(registro, origen, destino) {
  const src = resolve(origen);
  const dst = resolve(destino);
  const srcStat = lstatSync(src);
  if (!srcStat.isFile()) throw new Error(`La fuente no es un archivo regular: ${src}`);
  asegurarDirectorio(registro, dirname(dst));

  const propietario = buscarArchivo(registro, dst);
  if (existe(dst)) {
    const dstStat = lstatSync(dst);
    if (!dstStat.isFile() || dstStat.isSymbolicLink()) {
      console.warn(`  omitido por ruta no regular o enlace: ${dst}`);
      return false;
    }
    const actual = hashArchivo(dst);
    if (!propietario) {
      if (esRutaLegacy(registro, dst) && actual === hashArchivo(src)) {
        registrarArchivo(registro, dst, actual);
      } else {
        console.warn(`  conservado archivo preexistente: ${dst}`);
      }
      return false;
    }
    if (actual !== propietario.sha256) {
      console.warn(`  conservado archivo modificado por el usuario: ${dst}`);
      return false;
    }
  }

  if (!dryRun) {
    recordarAntesDeEscribir(dst);
    copyFileSync(src, dst);
    registrarEscritura(dst);
  } else console.log("[DRY-RUN] copy", dst);
  registrarArchivo(registro, dst, hashArchivo(src));
  return true;
}

function escribirArchivoSeguro(registro, destino, contenido) {
  const dst = resolve(destino);
  asegurarDirectorio(registro, dirname(dst));
  const esperado = hashTexto(contenido);
  const propietario = buscarArchivo(registro, dst);
  if (existe(dst)) {
    const st = lstatSync(dst);
    if (!st.isFile() || st.isSymbolicLink()) {
      console.warn(`  omitido por ruta no regular o enlace: ${dst}`);
      return false;
    }
    const actual = hashArchivo(dst);
    if (!propietario) {
      if (esRutaLegacy(registro, dst) && actual === esperado) registrarArchivo(registro, dst, actual);
      else console.warn(`  conservado archivo preexistente: ${dst}`);
      return false;
    }
    if (actual !== propietario.sha256) {
      console.warn(`  conservado archivo modificado por el usuario: ${dst}`);
      return false;
    }
  }
  if (!dryRun) {
    recordarAntesDeEscribir(dst);
    writeFileSync(dst, contenido, "utf8");
    registrarEscritura(dst);
  } else console.log("[DRY-RUN] write", dst);
  registrarArchivo(registro, dst, esperado);
  return true;
}

function copiarArbol(registro, origen, destino) {
  asegurarDirectorio(registro, destino);
  for (const entrada of readdirSync(origen, { withFileTypes: true })) {
    const src = join(origen, entrada.name);
    const dst = join(destino, entrada.name);
    if (entrada.isDirectory()) copiarArbol(registro, src, dst);
    else if (entrada.isFile()) copiarArchivoSeguro(registro, src, dst);
    else console.warn(`  omitido tipo de fuente no soportado: ${src}`);
  }
}

// Copia exclusivamente el inventario certificado a ~/.repofibe/app.
function instalarApp(registro) {
  const manifiesto = obtenerManifiestoFuente();
  asegurarDirectorio(registro, APP);
  for (const archivo of manifiesto.archivos) {
    copiarArchivoSeguro(registro, join(RAIZ, ...archivo.ruta.split("/")), join(APP, ...archivo.ruta.split("/")));
  }
  const serializado = `${JSON.stringify(manifiesto, null, 2)}\n`;
  escribirArchivoSeguro(registro, join(APP, NOMBRE_MANIFIESTO), serializado);
  anotar(registro, APP);
  registro.distribucion = { version: manifiesto.version, commit: manifiesto.commit };
  guardarRegistro(registro);
  if (dryRun) {
    console.log(`  nucleo compartido -> ${APP} (dry-run; diagnostico omitido)`);
    return;
  }
  const diagnostico = diagnosticarInstalacion({ raiz: APP, hogar: HOGAR, ignorarActualizacion: Boolean(transaccion) });
  if (diagnostico.estado !== "coherente") {
    throw new Error(`El diagnóstico posterior a la copia no pasó (${diagnostico.estado}); faltantes=${diagnostico.archivos.faltantes.join(",")}; modificados=${diagnostico.archivos.modificados.join(",")}; dependencias=${diagnostico.dependenciasInternasFaltantes.join(",")}; errores=${diagnostico.errores.join(",")}`);
  }
  console.log(`  nucleo compartido -> ${APP}`);
}

function skills() {
  return obtenerManifiestoFuente().archivos
    .map((f) => f.ruta.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1])
    .filter(Boolean)
    .sort();
}

// Reescribe el `name:` del frontmatter a `<prefijo><skill>` (p.ej.
// repofibe-qa). El repo fuente conserva el nombre corto (legible, y así la
// eval tier-1 `name === carpeta` sigue pasando); SOLO la copia instalada
// lleva el prefijo, para que no colisione con otras suites (gstack también
// define `qa`, `retro`, `benchmark`). Idempotente: no vuelve a prefijar.
function prefijarNombreSkill(contenido, prefijo, skill) {
  return contenido.replace(/^name:\s*(\S+)/m, (m, nombre) =>
    nombre.startsWith(prefijo) ? m : `name: ${prefijo}${skill}`);
}

function copiarSkills(registro, destinoBase, prefijo = "repofibe-") {
  const base = resolve(destinoBase);
  asegurarDirectorio(registro, base);
  anotarDestino(registro, base);
  const manifiesto = obtenerManifiestoFuente();
  for (const s of skills()) {
    const destino = join(base, prefijo + s);
    const prefijoFuente = `skills/${s}/`;
    for (const archivo of manifiesto.archivos.filter((f) => f.ruta.startsWith(prefijoFuente))) {
      const relativo = archivo.ruta.slice(prefijoFuente.length);
      copiarArchivoSeguro(registro, join(RAIZ, "skills", s, ...relativo.split("/")), join(destino, ...relativo.split("/")));
    }
    asegurarDirectorio(registro, destino);
    // El SKILL.md se reescribe con el nombre prefijado (la copia de
    // copiarArbol trae el nombre corto; esto la sobrescribe con ownership
    // por hash del contenido transformado, así el refresco no la ve "editada").
    const fuenteMd = readFileSync(join(RAIZ, "skills", s, "SKILL.md"), "utf8");
    escribirArchivoSeguro(registro, join(destino, "SKILL.md"), prefijarNombreSkill(fuenteMd, prefijo, s));
    anotar(registro, destino);
  }
  console.log(`  ${skills().length} skills (nombre interno con prefijo "${prefijo}") -> ${base}`);
}

function extraerBloque(texto) {
  const i = texto.indexOf(MARCA_INICIO);
  const f = texto.indexOf(MARCA_FIN);
  if (i < 0 || f <= i) return null;
  const fin = f + MARCA_FIN.length;
  return { inicio: i, fin, contenido: texto.slice(i, fin) };
}

// Inserta/reemplaza el bloque marcado sin apropiarse de bloques desconocidos.
function ponerBloque(registro, archivo, contenido) {
  const destino = resolve(archivo);
  asegurarDirectorio(registro, dirname(destino));
  const existia = existe(destino);
  if (existia && (!lstatSync(destino).isFile() || lstatSync(destino).isSymbolicLink())) {
    console.warn(`  bloque omitido por ruta no regular o enlace: ${destino}`);
    return false;
  }

  const bloque = `${MARCA_INICIO}\n${contenido.trim()}\n${MARCA_FIN}`;
  const texto = existia ? readFileSync(destino, "utf8") : "";
  const actual = extraerBloque(texto);
  const propio = buscarBloque(registro, destino);
  if (actual) {
    const coincideConRegistro = propio && hashTexto(actual.contenido) === propio.sha256;
    const coincideConLegacy = !propio && registro._legacy && registro.bloques.some((r) => claveRuta(r) === claveRuta(destino)) && actual.contenido === bloque;
    if (!coincideConRegistro && !coincideConLegacy) {
      console.warn(`  bloque preexistente conservado: ${destino}`);
      return false;
    }
  }

  let nuevo;
  if (actual) nuevo = texto.slice(0, actual.inicio) + bloque + texto.slice(actual.fin);
  else nuevo = texto.trimEnd() + (texto ? "\n\n" : "") + bloque + "\n";
  if (dryRun) console.log("[DRY-RUN] write", destino);
  else {
    recordarAntesDeEscribir(destino);
    writeFileSync(destino, nuevo, "utf8");
    registrarEscritura(destino);
  }
  const instalado = extraerBloque(nuevo);
  registrarBloque(registro, destino, hashTexto(instalado.contenido), !existia);
  console.log(`  bloque de reglas -> ${destino}`);
  return true;
}

function bloqueReglas() {
  const lista = skills().map((s) => "repofibe-" + s).join(", ");
  return `## repofibe - La Fabrica
Equipo de ingenieria virtual en espanol. Skills instaladas (Agent Skills): ${lista}.
- Flujo de sprint: pensar (oficina) -> planear (plan-ceo, plan-ing, plan-diseno) -> construir -> revisar -> probar (qa) -> shipear -> retro. Orquestador: repofibe-fabrica.
- Protocolo: evidencia antes de afirmacion; causa raiz antes de parche; leer antes de escribir. Detalle: ~/.repofibe/app/plantillas/razonamiento-fable.md
- Antes de comandos destructivos (rm -rf, git reset --hard, push --force, DROP TABLE): explicar que se pierde y pedir confirmacion explicita.`;
}

function anotarPlugin(registro, nombre) {
  if (!registro.plugins.includes(nombre)) registro.plugins.push(nombre);
}

// ── Hooks sin plugin nativo ─────────────────────────────────────────────────
// El modo copia instala las skills pero NO los hooks, porque hooks.json solo
// lo lee el sistema de plugins. Resultado real observado (2026-07-25): una
// instalación que cayó al fallback de copia dejó los guardias deterministas
// —la pieza central de la arquitectura— apagados para siempre, en silencio,
// porque cada --refrescar volvía a entrar por la rama de copia sin reintentar
// ni avisar.
//
// Claude Code también lee hooks de ~/.claude/settings.json, así que ahí se
// registran, con rutas absolutas a este checkout. Idempotente: se identifica
// cada entrada por su comando, de modo que reinstalar actualiza en vez de
// duplicar. Se respalda el archivo antes de tocarlo: es configuración del
// usuario con mucho dentro, y un merge mal hecho le rompería el entorno.
const RUTA_SETTINGS = join(HOGAR, ".claude", "settings.json");

function entradasHook() {
  const cmd = (archivo) => `node "${join(APP, "hooks", archivo).replaceAll("\\", "/")}"`;
  return {
    PreToolUse: {
      archivo: "guardia.mjs",
      entrada: {
        matcher: "Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit|Skill",
        hooks: [{ type: "command", command: cmd("guardia.mjs") }],
      },
    },
    SessionStart: {
      archivo: "sesion.mjs",
      entrada: {
        matcher: "startup|resume",
        hooks: [{ type: "command", command: cmd("sesion.mjs") }],
      },
    },
  };
}

function actualizarHooksClaude(registro, { activar = true, retirarPropios = false } = {}) {
  if (!existe(join(HOGAR, ".claude"))) {
    console.log("  hooks: no hay ~/.claude (Claude Code no detectado) - omitido");
    return false;
  }

  let settings = {};
  const existia = existe(RUTA_SETTINGS);
  if (existia) {
    try {
      settings = JSON.parse(readFileSync(RUTA_SETTINGS, "utf8"));
    } catch (e) {
      console.warn(`  hooks: ${RUTA_SETTINGS} no es JSON válido - NO se toca (${e.message})`);
      return false;
    }
  }

  const deseadas = entradasHook();
  settings.hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  let cambios = 0;

  // F17: esta cadena identifica la única entrada experimental observada en
  // la auditoría. No se elimina por basename ni por coincidencia parcial.
  const postTool = Array.isArray(settings.hooks.PostToolUse) ? settings.hooks.PostToolUse : [];
  const postToolNuevo = [];
  for (const entrada of postTool) {
    if (!Array.isArray(entrada?.hooks)) {
      postToolNuevo.push(entrada);
      continue;
    }
    const hooks = entrada.hooks.filter((h) => h?.command !== LEGADO_ANTIVIRUS);
    const removidos = entrada.hooks.length - hooks.length;
    if (removidos) {
      cambios += removidos;
      if (hooks.length) postToolNuevo.push({ ...entrada, hooks });
    } else postToolNuevo.push(entrada);
  }
  if (cambios) settings.hooks.PostToolUse = postToolNuevo;

  if (retirarPropios) {
    for (const [evento, { entrada }] of Object.entries(deseadas)) {
      const lista = Array.isArray(settings.hooks[evento]) ? settings.hooks[evento] : [];
      const comandosPropios = new Set(entrada.hooks.map((h) => h.command));
      const nueva = [];
      for (const actual of lista) {
        const hooks = Array.isArray(actual?.hooks) ? actual.hooks : [];
        const conservados = hooks.filter((h) => !comandosPropios.has(h?.command));
        const removidos = hooks.length - conservados.length;
        if (removidos) {
          cambios += removidos;
          if (conservados.length) nueva.push({ ...actual, hooks: conservados });
        } else nueva.push(actual);
      }
      if (nueva.length !== lista.length || nueva.some((e, i) => e !== lista[i])) settings.hooks[evento] = nueva;
    }
  }

  if (activar) for (const [evento, { archivo, entrada }] of Object.entries(deseadas)) {
    const lista = Array.isArray(settings.hooks[evento]) ? settings.hooks[evento] : [];
    // Identidad por NOMBRE del hook, no por comando exacto: así una ruta que
    // cambió (repo movido) se actualiza en vez de duplicarse. Sin comillas en
    // la marca a propósito — JSON.stringify las escapa como \" y una marca que
    // las incluyera no coincidiría nunca (bug real, detectado por la eval:
    // la primera versión duplicaba las entradas en cada ejecución).
    const marca = `hooks/${archivo}`;
    const i = lista.findIndex((e) => JSON.stringify(e).includes(marca));
    if (i >= 0) {
      if (JSON.stringify(lista[i]) === JSON.stringify(entrada)) continue;
      lista[i] = entrada;
    } else {
      lista.push(entrada);
    }
    settings.hooks[evento] = lista;
    cambios++;
  }

  if (!cambios) {
    console.log("  hooks: ya estaban registrados y al día en settings.json");
    return true;
  }

  if (dryRun) {
    console.log(`[DRY-RUN] registraría ${cambios} hook(s) en ${RUTA_SETTINGS}`);
    return true;
  }

  const serializado = JSON.stringify(settings, null, 2) + "\n";
  JSON.parse(serializado); // no escribir algo que no se puede releer

  // El respaldo se hace UNA sola vez: conserva el settings.json original del
  // usuario, no la última versión ya modificada por repofibe.
  const respaldo = `${RUTA_SETTINGS}.bak-repofibe`;
  if (existia && !existe(respaldo)) {
    recordarAntesDeEscribir(respaldo);
    writeFileSync(respaldo, readFileSync(RUTA_SETTINGS, "utf8"), "utf8");
    registrarEscritura(respaldo);
    console.log(`  respaldo del original -> ${respaldo}`);
  }
  const tmp = `${RUTA_SETTINGS}.tmp-repofibe-${process.pid}`;
  recordarAntesDeEscribir(RUTA_SETTINGS);
  try {
    writeFileSync(tmp, serializado, { encoding: "utf8", flag: "wx" });
    renameSync(tmp, RUTA_SETTINGS); // atómico: nunca un settings.json a medias
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
  registrarEscritura(RUTA_SETTINGS);

  if (registro) registrarBloque(registro, RUTA_SETTINGS, hashTexto(serializado), !existia);
  console.log(`  configuración de hooks actualizada en ${RUTA_SETTINGS} (${cambios} cambio(s))`);
  if (activar) console.log("  reinicia Claude Code para que cargue los hooks.");
  return true;
}

function activarHooksClaude(registro) {
  return actualizarHooksClaude(registro, { activar: true });
}

function retirarHookExperimentalClaude(registro) {
  return actualizarHooksClaude(registro, { activar: false });
}

function desactivarHooksClaude(registro) {
  return actualizarHooksClaude(registro, { activar: false, retirarPropios: true });
}

// Desinstala solo archivos cuyo hash demuestra que siguen siendo la copia creada.
function quitarArchivoPropio(registro, propiedad) {
  const ruta = resolve(propiedad.ruta);
  if (!existe(ruta)) return;
  const st = lstatSync(ruta);
  if (!st.isFile() || st.isSymbolicLink()) {
    console.warn(`  conservado archivo no regular: ${ruta}`);
    return;
  }
  if (hashArchivo(ruta) !== propiedad.sha256) {
    console.warn(`  conservado archivo modificado por el usuario: ${ruta}`);
    return;
  }
  if (!dryRun) {
    recordarAntesDeEscribir(ruta);
    unlinkSync(ruta);
    registrarEscritura(ruta);
  } else console.log("[DRY-RUN] unlink", ruta);
  console.log(`  eliminado: ${ruta}`);
}

function quitarBloquePropio(propiedad) {
  const ruta = resolve(propiedad.ruta);
  if (!existe(ruta)) return;
  const st = lstatSync(ruta);
  if (!st.isFile() || st.isSymbolicLink()) {
    console.warn(`  bloque conservado por ruta no regular: ${ruta}`);
    return;
  }
  const texto = readFileSync(ruta, "utf8");
  const actual = extraerBloque(texto);
  if (!actual || hashTexto(actual.contenido) !== propiedad.sha256) {
    console.warn(`  bloque conservado por cambios del usuario: ${ruta}`);
    return;
  }
  let despues = texto.slice(actual.fin);
  if (despues.startsWith("\r\n")) despues = despues.slice(2);
  else if (despues.startsWith("\n")) despues = despues.slice(1);
  // ponerBloque separa el contenido previo del bloque con "\n\n" (vía
  // trimEnd + separador); deshacer eso exactamente para no dejar una línea
  // en blanco huérfana que ponerBloque nunca puso ahí a propósito.
  let antes = texto.slice(0, actual.inicio).replace(/\r?\n+$/, "");
  if (antes) antes += texto.includes("\r\n") ? "\r\n" : "\n";
  const nuevo = antes + despues;
  if (propiedad.creado && nuevo.trim() === "") {
    if (!dryRun) {
      recordarAntesDeEscribir(ruta);
      unlinkSync(ruta);
      registrarEscritura(ruta);
    } else console.log("[DRY-RUN] unlink", ruta);
  } else {
    if (!dryRun) {
      recordarAntesDeEscribir(ruta);
      writeFileSync(ruta, nuevo, "utf8");
      registrarEscritura(ruta);
    } else console.log("[DRY-RUN] write", ruta);
  }
  console.log(`  bloque removido de: ${ruta}`);
}

function quitarDirectoriosVacios(registro) {
  const orden = [...registro.directorios].sort((a, b) => b.length - a.length);
  for (const ruta of orden) {
    try {
      const st = lstatSync(ruta);
      if (st.isDirectory() && readdirSync(ruta).length === 0) {
        if (!dryRun) rmdirSync(ruta); else console.log("[DRY-RUN] rmdir", ruta);
        console.log(`  directorio vacio eliminado: ${ruta}`);
      }
    } catch {}
  }
}

// hosts
const HOSTS = {
  claude: {
    detectar: () => existe(join(HOGAR, ".claude")),
    instalar(registro) {
      const yaEnCopias = registro.rutas.some((r) => r.includes(join(".claude", "skills", "repofibe-")));
      if (yaEnCopias) {
        copiarSkills(registro, join(HOGAR, ".claude", "skills"));
        console.log("  (refresco en modo copia - instalacion previa detectada)");
        // Los hooks se reactivan SIEMPRE en cada refresco. Antes esta rama
        // solo copiaba skills y volvia, de modo que una instalacion que cayo
        // al fallback de copia dejaba los guardias deterministas apagados en
        // silencio para siempre: ningun --refrescar los reintentaba ni avisaba.
        if (!activarHooksClaude(registro)) throw new Error("No se pudieron activar los hooks de Claude Code");
        return;
      }
      if (!retirarHookExperimentalClaude(registro)) {
        throw new Error("No se pudo retirar de forma segura la entrada experimental auditada de Claude Code");
      }
      if (dryRun) {
        console.log("  [DRY-RUN] registrar marketplace e instalar plugin; se simula fallback de skills");
        copiarSkills(registro, join(HOGAR, ".claude", "skills"));
        activarHooksClaude(registro);
        return;
      }
      let marketplacesAntes;
      let pluginsAntes;
      try {
        marketplacesAntes = listarMarketplacesClaude();
        pluginsAntes = listarPluginsClaude();
      } catch (e) {
        console.log(`  CLI de Claude sin JSON compatible o estado ilegible (${e.message}) - fallback a copia de skills`);
        copiarSkills(registro, join(HOGAR, ".claude", "skills"));
        if (!activarHooksClaude(registro)) throw new Error("No se pudieron activar los hooks de Claude Code");
        return;
      }

      const coincidencias = marketplacesAntes.filter((marketplace) => marketplace.name === MARKETPLACE_REPOFIBE);
      const marketplacePreexistente = coincidencias.length === 1 && marketplaceRepoFibe(coincidencias[0]);
      const pluginPreexistente = pluginsAntes.some((plugin) => plugin.id === PLUGIN_REPOFIBE);
      const conflictoMarketplace = coincidencias.length > 0 && !marketplacePreexistente;
      if (conflictoMarketplace || (!coincidencias.length && pluginPreexistente)) {
        console.log("  estado nativo de repofibe en conflicto; se conserva y se usa copia de skills");
        copiarSkills(registro, join(HOGAR, ".claude", "skills"));
        if (!activarHooksClaude(registro)) throw new Error("No se pudieron activar los hooks de Claude Code");
        return;
      }
      if (marketplacePreexistente && pluginPreexistente) {
        anotarPlugin(registro, "repofibe");
        console.log("  marketplace y plugin preexistentes conservados; activacion no comprobada");
        return;
      }

      let marketplaceCreado = false;
      let compensarPluginRegistrado = false;
      let compensarMarketplaceRegistrado = false;
      const compensarPlugin = () => compensarPluginClaude();
      const quitarCompensacion = (compensacion) => {
        if (transaccion) transaccion.compensaciones = transaccion.compensaciones.filter((actual) => actual !== compensacion);
      };
      const compensarMarketplace = () => compensarMarketplaceClaude();
      try {
        if (!marketplacePreexistente) {
          let respuestaAdd;
          try {
            respuestaAdd = resultadoClaudeJson(ejecutar("claude", ["plugin", "marketplace", "add", RAIZ, "--scope", "user", "--json"]), "marketplace-add");
          } catch (e) {
            let estadoPosterior;
            try { estadoPosterior = listarMarketplacesClaude(); }
            catch { throw new Error(`no se pudo determinar si marketplace add tuvo efecto: ${e.message}`); }
            if (estadoPosterior.some((marketplace) => marketplaceRepoFibe(marketplace))) {
              throw new Error(`marketplace add pudo tener efecto, pero no se pudo probar que esta ejecucion lo creo; se conserva: ${e.message}`);
            }
            throw e;
          }
          const addConfirmado = respuestaAdd.outcome === "ok" &&
            respuestaAdd.message.startsWith(`Successfully added marketplace: ${MARKETPLACE_REPOFIBE}`) &&
            (respuestaAdd.marketplace === undefined || respuestaAdd.marketplace === MARKETPLACE_REPOFIBE);
          if (!addConfirmado) {
            const estadoPosterior = listarMarketplacesClaude();
            if (estadoPosterior.some((marketplace) => marketplaceRepoFibe(marketplace))) {
              throw new Error("marketplace add no confirmo una creacion nueva; se conserva el estado por seguridad");
            }
            throw new Error(respuestaAdd.message || "marketplace add no confirmo el alta");
          }
          const estadoPosterior = listarMarketplacesClaude();
          if (!estadoPosterior.some((marketplace) => marketplaceRepoFibe(marketplace))) {
            throw new Error("marketplace add reporto exito, pero no aparece con el origen local esperado; no se intentara retirarlo");
          }
          marketplaceCreado = true;
          if (transaccion) transaccion.compensaciones.push(compensarMarketplace);
          compensarMarketplaceRegistrado = true;
        }

        if (transaccion) transaccion.compensaciones.push(compensarPlugin);
        compensarPluginRegistrado = true;
        const respuestaInstall = resultadoClaudeJson(ejecutar("claude", ["plugin", "install", PLUGIN_REPOFIBE, "--scope", "user", "--json"]), "install");
        if (respuestaInstall.outcome !== "ok") throw new Error(respuestaInstall.message);
        const pluginsDespues = listarPluginsClaude();
        const pluginUserInstalado = pluginsDespues.some((plugin) => plugin.id === PLUGIN_REPOFIBE && plugin.scope === "user");
        if (!pluginUserInstalado) {
          if (/already installed/i.test(respuestaInstall.message) && pluginsDespues.some((plugin) => plugin.id === PLUGIN_REPOFIBE)) {
            quitarCompensacion(compensarPlugin);
            compensarPluginRegistrado = false;
            anotarPlugin(registro, "repofibe");
            console.log("  plugin nativo preexistente conservado; activacion no comprobada");
            return;
          }
          throw new Error("plugin install no confirmo una instalacion en scope user");
        }
        anotarPlugin(registro, "repofibe");
        console.log("  plugin nativo registrado (activacion no comprobada)");
        return;
      } catch (errorInstall) {
        const erroresCompensacion = [];
        if (compensarPluginRegistrado) {
          try {
            compensarPluginClaude();
            quitarCompensacion(compensarPlugin);
            compensarPluginRegistrado = false;
          } catch (e) {
            erroresCompensacion.push(`plugin uninstall: ${e.message}`);
          }
        }
        if (marketplaceCreado && compensarMarketplaceRegistrado) {
          try {
            compensarMarketplaceClaude();
            quitarCompensacion(compensarMarketplace);
            compensarMarketplaceRegistrado = false;
          } catch (e) {
            erroresCompensacion.push(`marketplace remove: ${e.message}`);
          }
        }
        if (erroresCompensacion.length) {
          throw new Error(`No se pudieron compensar todos los cambios nativos de Claude: ${erroresCompensacion.join("; ")}; causa: ${errorInstall.message}`);
        }
        if (marketplaceCreado && compensarMarketplaceRegistrado) {
          throw new Error(`el plugin fallo y no se pudo retirar de forma segura el marketplace creado; causa: ${errorInstall.message}`);
        }
        console.log(`  CLI de Claude no pudo completar la instalacion (${errorInstall.message}) - fallback a copia de skills`);
      }
      copiarSkills(registro, join(HOGAR, ".claude", "skills"));
      if (!activarHooksClaude(registro)) throw new Error("No se pudieron activar los hooks de Claude Code");
    },
  },
  antigravity: {
    detectar: () => existe(join(HOGAR, ".gemini")),
    instalar(registro) {
      copiarSkills(registro, join(HOGAR, ".gemini", "config", "skills"));
      ponerBloque(registro, join(HOGAR, ".gemini", "GEMINI.md"), bloqueReglas());
      if (workspace && typeof workspace === "string") {
        const wf = join(resolve(workspace), ".agent", "workflows");
        for (const s of skills()) {
          const archivo = join(wf, `repofibe-${s}.md`);
          escribirArchivoSeguro(registro, archivo,
            `---\ndescription: repofibe /${s} - ver skill repofibe-${s}\n---\n` +
            `Lee el archivo ~/.gemini/config/skills/repofibe-${s}/SKILL.md y ejecutalo al pie de la letra. ` +
            `La raiz de repofibe es ~/.repofibe/app.\n`);
        }
        console.log(`  workflows de workspace -> ${wf}`);
      } else {
        console.log("  (opcional) --workspace <ruta> genera lanzadores /repofibe-* en .agent/workflows/");
      }
    },
  },
  codex: { detectar: () => existe(join(HOGAR, ".codex")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".codex", "skills")); } },
  cursor: { detectar: () => existe(join(HOGAR, ".cursor")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".cursor", "skills")); } },
  opencode: { detectar: () => existe(join(HOGAR, ".config", "opencode")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".config", "opencode", "skills")); } },
  generico: {
    detectar: () => false,
    instalar(registro) {
      const base = resolve(typeof workspace === "string" ? workspace : process.cwd());
      copiarSkills(registro, join(base, ".agent", "skills"));
      ponerBloque(registro, join(base, "AGENTS.md"), bloqueReglas());
    },
  },
};

// adoptar: migración única para instalaciones anteriores al modelo de
// ownership. Los archivos bajo rutas que repofibe creó (registro.rutas) pero
// sin entrada de ownership quedan registrados con su hash ACTUAL de disco —
// a partir de ahí el refresco puede actualizarlos normalmente. Los archivos
// fuera de registro.rutas siguen intocables. Advertencia honesta: si el
// usuario editó a mano uno de esos archivos instalados, la adopción lo
// tratará como propio y el siguiente refresco lo sobreescribirá — por eso
// este comando es explícito y nunca automático.
if (adoptar) {
  const registro = leerRegistro();
  const listarArchivos = (ruta, salida) => {
    const st = lstatSync(ruta);
    if (st.isSymbolicLink()) return salida;
    if (st.isFile()) { salida.push(ruta); return salida; }
    if (st.isDirectory()) for (const e of readdirSync(ruta)) listarArchivos(join(ruta, e), salida);
    return salida;
  };
  // Re-SINCRONIZA el ownership al hash real de disco: no solo adopta los
  // archivos sin entrada, también reescribe las entradas OBSOLETAS (cuyo hash
  // registrado ya no coincide con el disco). Sin esto, una entrada vieja hace
  // que el refresco crea que "el usuario editó" el archivo y lo preserve, y
  // las actualizaciones quedan bloqueadas para siempre. Estas rutas son las
  // carpetas de repofibe (repofibe-*), no archivos del usuario.
  let adoptados = 0;
  for (const base of registro.rutas) {
    if (!existe(base)) continue;
    for (const f of listarArchivos(resolve(base), [])) {
      const actual = hashArchivo(f);
      const previo = buscarArchivo(registro, f);
      if (previo && previo.sha256 === actual) continue; // ya sincronizado
      if (dryRun) { console.log("[DRY-RUN] adoptar/re-sincronizar", f); adoptados++; continue; }
      registrarArchivo(registro, f, actual);
      adoptados++;
    }
  }
  let bloquesAdoptados = 0;
  for (const ruta of registro.bloques) {
    if (buscarBloque(registro, ruta) || !existe(ruta)) continue;
    const st = lstatSync(ruta);
    if (!st.isFile() || st.isSymbolicLink()) continue;
    const actual = extraerBloque(readFileSync(ruta, "utf8"));
    if (!actual) continue;
    if (dryRun) { console.log("[DRY-RUN] adoptar bloque", ruta); bloquesAdoptados++; continue; }
    registrarBloque(registro, ruta, hashTexto(actual.contenido), false);
    bloquesAdoptados++;
  }
  if (!dryRun) guardarRegistro(registro);
  console.log(`Adopción completa: ${adoptados} archivo(s) y ${bloquesAdoptados} bloque(s) ahora tienen ownership.`);
  console.log("Siguiente paso: node nucleo/instalar.mjs --refrescar (las actualizaciones vuelven a fluir).");
  process.exit(0);
}

// refrescar conserva el contrato anterior, pero ahora respeta ownership.
if (refrescar) {
  const registro = leerRegistro();
  let bases = registro.destinos;
  if (!bases.length) {
    bases = [...new Set(
      registro.rutas
        .filter((r) => /repofibe-[a-z-]+$/.test(r))
        .map((r) => dirname(r)),
    )];
  }
  if (!bases.length && !registro.rutas.includes(APP)) {
    console.log("Nada que refrescar: no hay instalacion previa registrada.");
    process.exit(0);
  }
  let actualizarPluginNativo = false;
  ejecutarConRollback(() => {
  instalarApp(registro);
  for (const base of bases) copiarSkills(registro, base);
  if (existe(join(HOGAR, ".claude"))) {
    if (registro.plugins.includes("repofibe")) {
      if (!retirarHookExperimentalClaude(registro)) throw new Error("No se pudo migrar la configuracion experimental de Claude Code");
      actualizarPluginNativo = true;
    } else if (!activarHooksClaude(registro)) {
      throw new Error("No se pudieron verificar y reactivar los hooks de Claude Code");
    }
  }
  guardarRegistro(registro);
  if (dryRun) { console.log("[DRY-RUN] diagnostico posterior al refresco omitido"); return; }
  const requiereClaude = existe(join(HOGAR, ".claude"));
  const diagnostico = diagnosticarInstalacion({ raiz: APP, hogar: HOGAR, anfitrion: requiereClaude ? "claude" : null, ignorarActualizacion: Boolean(transaccion) });
  if (diagnostico.estado !== "coherente") {
    throw new Error(`El refresco no pasó el diagnóstico (${diagnostico.estado}); faltantes=${diagnostico.archivos.faltantes.join(",")}; modificados=${diagnostico.archivos.modificados.join(",")}`);
  }
  });
  if (actualizarPluginNativo) {
    if (dryRun) console.log("[DRY-RUN] claude plugin update repofibe");
    else {
      try { ejecutar("claude", ["plugin", "update", "repofibe"]); }
      catch { throw new Error("La app local ya se refresco; no se pudo actualizar el plugin nativo con la CLI de Claude. Reintenta --refrescar"); }
    }
  }
  console.log(`Refresco completo en ${bases.length} destino(s).`);
  process.exit(0);
}

if (quitar) {
  const registro = leerRegistro();
  if (existe(join(HOGAR, ".claude"))) desactivarHooksClaude(registro);
  for (const propiedad of registro.archivos) {
    try { quitarArchivoPropio(registro, propiedad); } catch (e) { console.warn(`  no se pudo quitar ${propiedad.ruta}: ${e.message}`); }
  }
  for (const propiedad of registro.bloquesPropios) {
    try { quitarBloquePropio(propiedad); } catch (e) { console.warn(`  no se pudo quitar bloque ${propiedad.ruta}: ${e.message}`); }
  }
  if (registro._legacy && registro.rutas.length) console.warn("  instalacion antigua detectada: carpetas y archivos sin ownership se conservan por seguridad");
  quitarDirectoriosVacios(registro);
  if (registro.plugins.includes("repofibe")) {
    try { ejecutar("claude", ["plugin", "uninstall", "repofibe"]); console.log("  plugin de Claude desinstalado"); } catch {}
  }
  guardarRegistro(registroBase());
  console.log("repofibe desinstalado. (~/.repofibe/memoria.jsonl se conserva; borralo a mano si quieres.)");
  process.exit(0);
}

const elegidos = hostPedido && hostPedido !== true
  ? (hostPedido === "todos" ? Object.keys(HOSTS) : [hostPedido])
  : Object.keys(HOSTS).filter((h) => HOSTS[h].detectar());

if (!elegidos.length) {
  console.error("No se detecto ningun host. Usa --host <claude|antigravity|codex|cursor|opencode|generico>.");
  process.exit(1);
}
if (elegidos.some((h) => !HOSTS[h])) {
  console.error(`Host desconocido. Validos: ${Object.keys(HOSTS).join(", ")}, todos.`);
  process.exit(1);
}

const registro = leerRegistro();

// --hooks: solo activar los guardias deterministas, sin tocar skills.
if (soloHooks) {
  console.log("Activando hooks deterministas de repofibe en Claude Code...");
  ejecutarConRollback(() => {
  instalarApp(registro);
  const ok = activarHooksClaude(registro);
  guardarRegistro(registro);
  if (dryRun) return;
  const diagnostico = ok
    ? diagnosticarInstalacion({ raiz: APP, hogar: HOGAR, anfitrion: "claude", ignorarActualizacion: Boolean(transaccion) })
    : { estado: "incompleta" };
  if (diagnostico.estado !== "coherente") {
    console.error(`Diagnóstico final falló: ${diagnostico.estado}`);
    throw new Error("Diagnostico final fallo");
  }
  });
  process.exit(0);
}

ejecutarConRollback(() => {
instalarApp(registro);
for (const h of elegidos) {
  console.log(`\n[${h}]`);
  HOSTS[h].instalar(registro);
}
guardarRegistro(registro);
if (dryRun) {
  console.log("[DRY-RUN] diagnostico final omitido");
} else {
const anfitrionRequerido = elegidos.includes("claude") ? "claude" : null;
const diagnostico = diagnosticarInstalacion({ raiz: APP, hogar: HOGAR, anfitrion: anfitrionRequerido, ignorarActualizacion: Boolean(transaccion) });
if (diagnostico.estado !== "coherente") {
  console.error(`Diagnóstico final falló: ${diagnostico.estado}; faltantes=${diagnostico.archivos.faltantes.join(",")}; modificados=${diagnostico.archivos.modificados.join(",")}`);
  throw new Error("Diagnostico final fallo; revisar faltantes/modificados impresos arriba");
}
}
});
console.log(`\nListo. repofibe ${readFileSync(join(RAIZ, "VERSION"), "utf8").trim()} instalado en: ${elegidos.join(", ")}.`);
console.log("Actualizar = volver a ejecutar este instalador. Desinstalar = --quitar.");
