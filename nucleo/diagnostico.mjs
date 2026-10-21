#!/usr/bin/env node
// Diagnóstico de solo lectura para la instalación activa.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NOMBRE_MANIFIESTO, leerManifiesto, verificarArchivos } from "./distribucion.mjs";

const HOGAR = homedir();
const APP_POR_DEFECTO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NORMALIZAR = (ruta) => resolve(ruta).replaceAll("\\", "/").toLowerCase();

function leerJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return null; }
}

function comandoIncluye(settings, evento, script) {
  const esperado = NORMALIZAR(script);
  return (Array.isArray(settings?.hooks?.[evento]) ? settings.hooks[evento] : [])
    .some((e) => (Array.isArray(e?.hooks) ? e.hooks : [])
      .some((h) => typeof h?.command === "string" && NORMALIZAR(h.command.replace(/^\s*node\s+['"]?|['"]?\s*$/g, "")).includes(esperado)));
}

function revisarHooks(raizApp, anfitrion, hogar) {
  if (anfitrion !== "claude") return { estado: "no_requeridos" };
  const settings = leerJson(join(hogar, ".claude", "settings.json"));
  const registro = leerJson(join(hogar, ".repofibe", "instalado.json"));
  const plugin = registro?.plugins?.includes("repofibe") === true;
  const guardia = comandoIncluye(settings, "PreToolUse", join(raizApp, "hooks", "guardia.mjs"));
  const sesion = comandoIncluye(settings, "SessionStart", join(raizApp, "hooks", "sesion.mjs"));
  if (plugin) return { estado: "registrado_no_verificado", via: "registro de instalacion", guardia: null, sesion: null };
  return { estado: guardia && sesion ? "configuracion_coherente" : "incompleta", via: "settings.json", guardia, sesion };
}

function revisarImportsLocales(raiz, manifiesto) {
  const faltantes = [];
  const incluidos = new Set(manifiesto.archivos.map((f) => f.ruta));
  for (const ruta of incluidos) {
    if (!ruta.endsWith(".mjs")) continue;
    const archivoFuente = join(raiz, ...ruta.split("/"));
    if (!existsSync(archivoFuente)) continue;
    const fuente = readFileSync(archivoFuente, "utf8");
    const especificadores = new Set();
    for (const m of fuente.matchAll(/^\s*import\s+(?:[^'";\n]+?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']/gm)) especificadores.add(m[1]);
    for (const m of fuente.matchAll(/^\s*export\s+[^'";\n]+?\s+from\s*["'](\.{1,2}\/[^"']+)["']/gm)) especificadores.add(m[1]);
    for (const m of fuente.matchAll(/\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) especificadores.add(m[1]);
    for (const especificador of especificadores) {
      const destino = resolve(dirname(join(raiz, ...ruta.split("/"))), especificador).replaceAll("\\", "/");
      const relativo = destino.slice(resolve(raiz).replaceAll("\\", "/").length + 1);
      if (!incluidos.has(relativo)) faltantes.push(`${ruta} -> ${especificador}`);
    }
  }
  return [...new Set(faltantes)];
}

function capacidadNavegador(raiz) {
  try {
    const require = createRequire(join(raiz, "package.json"));
    require.resolve("playwright");
    return "disponible";
  } catch {
    return "capacidad_opcional_ausente";
  }
}

export function diagnosticarInstalacion({ raiz = APP_POR_DEFECTO, hogar = HOGAR, anfitrion = null, requisitos = [], ignorarActualizacion = false } = {}) {
  const base = resolve(raiz);
  const rutaManifiesto = join(base, NOMBRE_MANIFIESTO);
  const resultado = {
    estado: "incompleta",
    raiz: base,
    version: null,
    commit: null,
    archivos: { faltantes: [], modificados: [], total: 0 },
    dependenciasInternasFaltantes: [],
    hooks: anfitrion ? revisarHooks(base, anfitrion, hogar) : { estado: "no_verificados" },
    capacidades: {},
    errores: [],
  };

  if (!ignorarActualizacion && existsSync(join(hogar, ".repofibe", "en-actualizacion.json"))) {
    resultado.estado = "en_actualizacion";
    return resultado;
  }
  if (!existsSync(rutaManifiesto)) {
    resultado.errores.push("falta distribucion.json");
    return resultado;
  }

  let manifiesto;
  try {
    manifiesto = leerManifiesto(rutaManifiesto);
  } catch (e) {
    resultado.errores.push(e.message);
    return resultado;
  }

  resultado.version = manifiesto.version;
  resultado.commit = manifiesto.commit;
  const identidadRegistrada = leerJson(join(hogar, ".repofibe", "instalado.json"))?.distribucion;
  const identidadCoincide = !identidadRegistrada ||
    (identidadRegistrada.version === manifiesto.version && identidadRegistrada.commit === manifiesto.commit);
  if (!identidadCoincide) resultado.errores.push("la identidad instalada no coincide con el manifiesto");
  resultado.archivos.total = manifiesto.archivos.length;
  const contenido = verificarArchivos(base, manifiesto);
  resultado.archivos.faltantes = contenido.faltantes;
  resultado.archivos.modificados = contenido.modificados;
  if (existsSync(join(base, "VERSION"))) {
    const instalada = readFileSync(join(base, "VERSION"), "utf8").trim();
    if (instalada !== manifiesto.version) resultado.archivos.modificados.push("VERSION");
  }
  resultado.dependenciasInternasFaltantes = revisarImportsLocales(base, manifiesto);
  resultado.capacidades.navegador = capacidadNavegador(base);
  resultado.hooks = anfitrion ? revisarHooks(base, anfitrion, hogar) : resultado.hooks;

  const faltanHooks = resultado.hooks.estado === "incompleta";
  if (resultado.archivos.faltantes.length || resultado.dependenciasInternasFaltantes.length || faltanHooks) {
    resultado.estado = "incompleta";
  } else if (resultado.archivos.modificados.length || !identidadCoincide) {
    resultado.estado = "modificada";
  } else {
    resultado.estado = "coherente";
  }
  if (requisitos.includes("navegador") && resultado.capacidades.navegador !== "disponible") {
    resultado.errores.push("se solicitó capacidad de navegador, pero Playwright no está instalado");
    if (resultado.estado === "coherente") resultado.estado = "incompleta";
  }
  return resultado;
}

function argumentos(argv) {
  const resultado = { json: false, anfitrion: null, requisitos: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") resultado.json = true;
    else if (argv[i] === "--host") resultado.anfitrion = argv[++i] ?? null;
    else if (argv[i] === "--requiere") resultado.requisitos.push(argv[++i] ?? "");
    else if (argv[i] === "--raiz") resultado.raiz = argv[++i] ?? undefined;
  }
  return resultado;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = argumentos(process.argv.slice(2));
  const resultado = diagnosticarInstalacion(args);
  if (args.json) process.stdout.write(`${JSON.stringify(resultado)}\n`);
  else {
    process.stdout.write(`Estado: ${resultado.estado}\n`);
    if (resultado.version) process.stdout.write(`Versión: ${resultado.version} (${resultado.commit})\n`);
    if (resultado.hooks?.via === "registro de instalacion") {
      process.stdout.write("Hooks Claude: plugin registrado; activacion en el host no verificada.\n");
    } else if (resultado.hooks?.via === "settings.json") {
      const etiqueta = resultado.hooks.estado === "configuracion_coherente" ? "presente" : "incompleta";
      process.stdout.write(`Hooks Claude: configuracion ${etiqueta} en settings.json.\n`);
    }
    for (const error of resultado.errores) process.stdout.write(`Error: ${error}\n`);
    if (resultado.capacidades.navegador) process.stdout.write(`Navegador: ${resultado.capacidades.navegador}\n`);
  }
  if (resultado.estado !== "coherente" || resultado.errores.length) process.exitCode = 1;
}
