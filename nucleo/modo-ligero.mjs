#!/usr/bin/env node
// Selector determinista y conservador para el flujo ligero de /construir.
// La clasificación nunca concede permisos: los controles de alcance, permisos
// y operaciones destructivas siguen aplicando en ambos modos.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ_REPOFIBE = fileURLToPath(new URL("../", import.meta.url));
const RUTA_PRUEBAS = join(RAIZ_REPOFIBE, "nucleo", "pruebas.mjs");
const RUTA_SUITE = join(RAIZ_REPOFIBE, "evals", "validar.mjs");

const PASOS_LIGEROS = Object.freeze([
  "Confirmar el objetivo, el alcance autorizado y las rutas previstas.",
  "Aplicar solo el cambio pequeño y reversible dentro de ese alcance.",
  "Ejecutar el selector de pruebas afectadas de la instalación REPOFIBE, desde el repositorio consumidor.",
  "Revisar git diff --check y el diff completo.",
  "Comprobar que no hubo cambios fuera de alcance y mantener las guardias activas.",
]);

const PASOS_ESTRICTOS = Object.freeze([
  "Cargar el preámbulo, el contrato de cierre y el estado del sprint.",
  "Delimitar el alcance, las dependencias, los permisos y el impacto.",
  "Aplicar investigar o planificación cuando el tipo de trabajo lo requiera.",
  "Usar las guardias antes de operaciones sensibles o destructivas.",
  "Implementar en pasos verificables y conservar checkpoints recuperables.",
  "Ejecutar pruebas afectadas y ampliar la suite según el riesgo y la incertidumbre.",
  "Revisar el diff completo, los cambios de alcance y la evidencia.",
  "Registrar el resultado conforme al contrato de cierre.",
]);

const COMANDOS_LIGEROS = Object.freeze([
  `node "${RUTA_PRUEBAS}" afectadas --json`,
  "git diff --check",
  "git diff",
]);

const COMANDOS_ESTRICTOS = Object.freeze([
  `node "${RUTA_PRUEBAS}" afectadas --json`,
  `node "${RUTA_SUITE}"`,
  "git diff --check",
  "git diff",
]);

const RIESGO_EN_TEXTO = /\b(?:auth|authentication|autenticaci[oó]n|authorization|autorizaci[oó]n|security|seguridad|secrets?|secretos?|credentials?|credenciales|tokens?|passwords?|contrase[nñ]a|clave|datos?|data|datasets?|database|base de datos|migrat(?:e|ed|ion|ing)|migraci[oó]n|deploy(?:ment)?|despliegue|production|producci[oó]n|billing|facturaci[oó]n|payments?|pagos?|cobro|schemas?|esquemas?|permissions?|permisos?|destructiv[oa]s?|destructive|delete|remove|wipe|drop|borrar|eliminar|reset|clean(?:up)?|format|formatear|force|push|merge|release|publish|publicar|configs?|configuration|configuraci[oó]n|incertidumbre|insegur[oa]|incert[ai]n|uncertain|ambiguous|ambigu[oa]|duda|riesgo|multi[- ]?agent|multiagente|refactor|bug|error|fall[oa]|investig(?:a|ar|aci[oó]n)|fix|parche)\b/i;

const RUTA_CRITICA = /(?:^|\/)(?:\.git|\.github|\.codex|\.claude|\.fabrica|hooks?|skills?|plantillas|auth|authentication|autenticaci[oó]n|security|seguridad|secrets?|secretos?|credentials?|credenciales|data|datos|migrations?|migraci[oó]nes?|deploy(?:ment)?|despliegue|billing|facturaci[oó]n|payments?|pagos?|database|db|schemas?|esquemas?|config|configs|configuration|configuraci[oó]n)(?:\/|$)/i;
const ARCHIVO_CONFIG_CRITICO = /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|\.env(?:\..*)?|[^/]*config[^/]*|[^/]*settings?[^/]*|tsconfig(?:\.[^/]*)?|\.gitignore|\.gitattributes|\.npmrc|\.nvmrc|Dockerfile|docker-compose\.[^/]+)$/i;
const CARPETA_VALIDACION = /^(?:tests?|evals?|specs?|__tests__)(?:\/|$)/i;
const ARCHIVO_VALIDACION = /(?:^|\/)[^/]*\.(?:test|spec)\.[^.]+$/i;

const esObjeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);

function archivoRelativoSeguro(ruta) {
  if (typeof ruta !== "string" || !ruta.trim()) return false;
  const normalizada = ruta.replaceAll("\\", "/");
  return !normalizada.startsWith("/")
    && !/^[A-Za-z]:/.test(normalizada)
    && !normalizada.split("/").some((segmento) => segmento === ".." || segmento === "");
}

function areasDe(archivos) {
  const areas = new Set();
  for (const archivo of archivos) {
    const ruta = archivo.replaceAll("\\", "/");
    // Un archivo de prueba acompaña el área de implementación; por sí solo,
    // cambiar evaluaciones o pruebas queda en estricto para proteger sus gates.
    if (CARPETA_VALIDACION.test(ruta) || ARCHIVO_VALIDACION.test(ruta)) continue;
    const partes = ruta.split("/");
    if (partes.length > 2) areas.add(`${partes[0]}/${partes[1]}`.toLowerCase());
    else areas.add(partes[0].toLowerCase());
  }
  return areas;
}

function seleccionarSkillsEstrictas(objetivo, razones) {
  const skills = ["construir", "guardian"];
  if (/\b(?:bug|error|fall[oa]|rompe|investig|fix|parche)\b/i.test(objetivo)) skills.push("investigar");
  if (razones.some((razon) => /multi-?área|más de un área|más de dos archivos|difuso|complejidad/i.test(razon))) skills.push("plan-ing");
  return [...new Set(skills)];
}

function respuestaEstricta(objetivo, razones) {
  const razonesFinales = razones.length ? razones : ["La información no demuestra de forma suficiente que el cambio sea pequeño, interno y reversible."];
  return {
    modo: "estricto",
    riesgo: "no-bajo-o-desconocido",
    objetivo,
    razones: razonesFinales,
    skills: seleccionarSkillsEstrictas(objetivo, razonesFinales),
    tareas: [...PASOS_ESTRICTOS],
    comandos: [...COMANDOS_ESTRICTOS],
    controles: [
      "La guardia y la autorización de alcance siguen siendo obligatorias.",
      "La clasificación no autoriza borrar, sobrescribir, resetear ni actuar en rutas ajenas.",
      "Ante un fallo de análisis o una duda, mantener estricto y ampliar la verificación.",
    ],
    comparacionDeterminista: {
      pasosLigero: PASOS_LIGEROS.length,
      pasosEstricto: PASOS_ESTRICTOS.length,
      pasosMenosEnLigero: PASOS_ESTRICTOS.length - PASOS_LIGEROS.length,
      comandosLigero: COMANDOS_LIGEROS.length,
      comandosEstricto: COMANDOS_ESTRICTOS.length,
      latenciaModeloMedida: false,
    },
  };
}

/**
 * Selecciona el flujo solo cuando hay evidencia explícita para cada gate.
 * Es una recomendación de procedimiento, no un límite de seguridad ni sandbox.
 */
export function seleccionarModo(entrada) {
  const razones = [];
  if (!esObjeto(entrada)) return respuestaEstricta("", ["Entrada inválida o ambigua; se aplica el modo estricto."]);

  const objetivo = typeof entrada.objetivo === "string" ? entrada.objetivo.trim() : "";
  if (!objetivo) razones.push("Falta un objetivo concreto.");
  else if (objetivo.length < 16) razones.push("El objetivo es demasiado breve para demostrar que la tarea está bien delimitada.");
  if (objetivo.length > 220) razones.push("El objetivo excede el límite de una tarea pequeña y acotada.");
  if (RIESGO_EN_TEXTO.test(objetivo)) razones.push("El objetivo menciona riesgo, cambio sensible, depuración o una operación que requiere flujo estricto.");

  if (entrada.riesgo !== "bajo") razones.push("El riesgo no está declarado exactamente como bajo.");
  if (entrada.incierto === true || entrada.incertidumbre === true) razones.push("La solicitud declara incertidumbre.");

  if (!Array.isArray(entrada.archivos) || entrada.archivos.length === 0) {
    razones.push("No se proporcionó un conjunto de rutas previsto verificable.");
  } else {
    if (entrada.archivos.length > 2) razones.push("El cambio incluye más de dos archivos y requiere evaluar su radio completo.");
    if (entrada.archivos.some((archivo) => !archivoRelativoSeguro(archivo))) razones.push("Hay una ruta ausente, absoluta o que sale del repositorio.");
    const archivos = entrada.archivos.filter(archivoRelativoSeguro).map((archivo) => archivo.replaceAll("\\", "/"));
    if (archivos.some((archivo) => RUTA_CRITICA.test(archivo))) razones.push("Una ruta pertenece a un área crítica o protegida.");
    if (archivos.some((archivo) => ARCHIVO_CONFIG_CRITICO.test(archivo))) razones.push("Una ruta es configuración, manifiesto o archivo operativo crítico.");
    if (archivos.length && archivos.every((archivo) => CARPETA_VALIDACION.test(archivo) || ARCHIVO_VALIDACION.test(archivo))) {
      razones.push("El cambio afecta solo pruebas/evaluaciones y puede alterar sus controles.");
    }
    if (areasDe(archivos).size > 1) razones.push("El cambio cruza más de un área de implementación.");
  }

  if (!esObjeto(entrada.evidencia)) {
    razones.push("Falta la evidencia necesaria para comprobar alcance, impacto, pruebas y reversibilidad.");
  } else {
    if (entrada.evidencia.alcanceConocido !== true) razones.push("No está demostrado que el alcance sea conocido.");
    if (entrada.evidencia.impactoConocido !== true) razones.push("No está demostrado que el impacto sea conocido.");
    if (entrada.evidencia.pruebasConocidas !== true) razones.push("No está demostrado qué pruebas corresponden al cambio.");
    if (entrada.evidencia.reversible !== true) razones.push("No está demostrada la reversibilidad del cambio.");
    if (entrada.evidencia.confianza !== "alta") razones.push("La evidencia no tiene confianza alta.");
  }

  if (razones.length) return respuestaEstricta(objetivo, razones);

  return {
    modo: "ligero",
    riesgo: "bajo",
    objetivo,
    razones: ["Una tarea explícita, reversible, de una sola área, con rutas y pruebas conocidas."],
    skills: ["construir"],
    tareas: [...PASOS_LIGEROS],
    comandos: [...COMANDOS_LIGEROS],
    controles: [
      "Confirmar que cada ruta modificada permanece dentro del alcance autorizado.",
      "Mantener guardias, comprobaciones de permisos y confirmación de operaciones sensibles.",
      "Si aparece riesgo, una ruta adicional, una prueba inesperada o incertidumbre, cambiar inmediatamente a estricto.",
      "Ejecutar las pruebas afectadas y revisar el diff completo antes de cerrar.",
    ],
    comparacionDeterminista: {
      pasosLigero: PASOS_LIGEROS.length,
      pasosEstricto: PASOS_ESTRICTOS.length,
      pasosMenosEnLigero: PASOS_ESTRICTOS.length - PASOS_LIGEROS.length,
      comandosLigero: COMANDOS_LIGEROS.length,
      comandosEstricto: COMANDOS_ESTRICTOS.length,
      latenciaModeloMedida: false,
    },
  };
}

function leerEntrada(valor) {
  if (valor === undefined) throw new Error("falta el JSON de entrada o una ruta a archivo JSON");
  const texto = existsSync(valor) ? readFileSync(valor, "utf8") : valor;
  return JSON.parse(texto);
}

function leerEntradaEstandar() {
  return JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const [comando, ...argumentos] = process.argv.slice(2);
  const json = argumentos.includes("--json");
  const stdin = argumentos.includes("--stdin");
  const banderas = new Set(["--json", "--stdin"]);
  const valores = argumentos.filter((argumento) => !banderas.has(argumento));
  if (comando !== "analizar" || argumentos.some((argumento) => argumento.startsWith("-") && !banderas.has(argumento)) || valores.length > 1 || (stdin && valores.length > 0)) {
    console.error("Uso: node nucleo/modo-ligero.mjs analizar <JSON|archivo.json> [--json] | node nucleo/modo-ligero.mjs analizar --stdin [--json]");
    process.exitCode = 2;
    return;
  }

  let resultado;
  try {
    resultado = seleccionarModo(stdin ? leerEntradaEstandar() : leerEntrada(valores[0]));
  } catch (error) {
    resultado = respuestaEstricta("", [`No se pudo leer o interpretar la entrada; se aplica el modo estricto (${error.message}).`]);
  }
  if (json) process.stdout.write(`${JSON.stringify(resultado)}\n`);
  else {
    console.log(`MODO: ${resultado.modo}`);
    for (const razon of resultado.razones) console.log(`- ${razon}`);
    console.log(`Pasos: ${resultado.tareas.length}; comandos propuestos: ${resultado.comandos.length}; skills: ${resultado.skills.join(", ")}`);
    console.log("La comparación cuenta pasos/comandos del flujo; no mide latencia del modelo.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
