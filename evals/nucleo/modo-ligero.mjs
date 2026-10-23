#!/usr/bin/env node
// Eval determinista del selector ligero, su fallback estricto y la selección
// real de pruebas afectadas en un repositorio Git sintético de Windows.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { seleccionarModo } from "../../nucleo/modo-ligero.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const RUTA_PRUEBAS = join(RAIZ, "nucleo", "pruebas.mjs");
const RUTA_SUITE = join(RAIZ, "evals", "validar.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-modo-ligero-"));
const CONSUMIDOR_SELECTOR = join(TEMP, "consumer-selector");
mkdirSync(CONSUMIDOR_SELECTOR, { recursive: true });
const node = process.execPath;
const ejecutarGit = (args, cwd) => execFileSync("git", args, { cwd, stdio: "ignore" });
const evidenciaAlta = Object.freeze({
  alcanceConocido: true,
  impactoConocido: true,
  pruebasConocidas: true,
  reversible: true,
  confianza: "alta",
});
const entrada = (overrides = {}) => ({
  objetivo: "Añadir una etiqueta accesible a un control existente.",
  archivos: ["src/ui/etiqueta.mjs"],
  riesgo: "bajo",
  evidencia: { ...evidenciaAlta },
  ...overrides,
});

try {
  const ligera = seleccionarModo(entrada());
  assert.equal(ligera.modo, "ligero", "un cambio explícito, pequeño y reversible debe permitir el flujo ligero");
  assert.deepEqual(ligera.skills, ["construir"], "el modo ligero carga solo la skill de ejecución necesaria");
  assert.equal(ligera.comandos[0], `node "${RUTA_PRUEBAS}" afectadas --json`, "la prueba usa la ruta absoluta de la instalación incluso cuando contiene espacios");
  assert.ok(isAbsolute(RUTA_PRUEBAS));
  assert.ok(ligera.comandos.includes("git diff --check") && ligera.comandos.includes("git diff"), "el modo ligero revisa errores de formato y el diff completo");
  assert.ok(ligera.controles.some((control) => /guardias/i.test(control)), "la clasificación ligera preserva las guardias esenciales");
  assert.equal(ligera.comparacionDeterminista.pasosLigero, 5);
  assert.equal(ligera.comparacionDeterminista.pasosEstricto, 8);
  assert.equal(ligera.comparacionDeterminista.pasosMenosEnLigero, 3);
  assert.equal(ligera.comparacionDeterminista.latenciaModeloMedida, false, "el recuento de pasos no afirma una mejora de latencia");

  const conPrueba = seleccionarModo(entrada({ archivos: ["src/ui/etiqueta.mjs", "evals/ui/etiqueta.test.mjs"] }));
  assert.equal(conPrueba.modo, "ligero", "un test del área puede acompañar al único cambio de implementación");
  assert.deepEqual(conPrueba.skills, ["construir"]);

  const auth = seleccionarModo(entrada({ archivos: ["src/auth/sesion.mjs"] }));
  assert.equal(auth.modo, "estricto", "una ruta de autenticación siempre eleva el modo");
  assert.ok(auth.razones.some((razon) => /crítica|crítica|protegida/i.test(razon)));
  assert.ok(auth.skills.includes("guardian"), "un área sensible activa el procedimiento de guardia");

  const objetivoSensible = seleccionarModo(entrada({ objetivo: "Cambiar la validación de autenticación." }));
  assert.equal(objetivoSensible.modo, "estricto", "la clasificación no debe confiar solo en rutas cuando el objetivo revela riesgo");
  assert.equal(objetivoSensible.comandos[0], `node "${RUTA_PRUEBAS}" afectadas --json`);
  assert.equal(objetivoSensible.comandos[1], `node "${RUTA_SUITE}"`, "el flujo estricto usa ruta absoluta para su suite");

  const config = seleccionarModo(entrada({ archivos: ["package.json"] }));
  assert.equal(config.modo, "estricto", "los manifiestos y configuraciones críticas no entran en modo ligero");

  const multiArea = seleccionarModo(entrada({ archivos: ["src/ui/etiqueta.mjs", "src/auth/sesion.mjs"] }));
  assert.equal(multiArea.modo, "estricto", "un cambio que cruza áreas eleva el flujo");

  const sinEvidencia = seleccionarModo({ objetivo: "Cambiar un texto", archivos: ["src/ui/etiqueta.mjs"], riesgo: "bajo" });
  assert.equal(sinEvidencia.modo, "estricto", "la ausencia de evidencia de impacto y pruebas no concede modo ligero");
  const objetivoVago = seleccionarModo(entrada({ objetivo: "Cambiar algo." }));
  assert.equal(objetivoVago.modo, "estricto", "un objetivo demasiado breve no basta para afirmar que sea una tarea pequeña");

  const rutaAjena = seleccionarModo(entrada({ archivos: ["../otro-proyecto/archivo.mjs"] }));
  assert.equal(rutaAjena.modo, "estricto", "una ruta fuera del repositorio siempre eleva el modo");

  const cli = spawnSync(node, [join(RAIZ, "nucleo", "modo-ligero.mjs"), "analizar", "no-es-json", "--json"], {
    cwd: RAIZ, encoding: "utf8", timeout: 10000,
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).modo, "estricto", "entrada CLI malformada cae de forma segura a estricto");
  const cliSinEntrada = spawnSync(node, [join(RAIZ, "nucleo", "modo-ligero.mjs"), "analizar", "--json"], {
    cwd: RAIZ, encoding: "utf8", timeout: 10000,
  });
  assert.equal(cliSinEntrada.status, 0, cliSinEntrada.stderr);
  assert.equal(JSON.parse(cliSinEntrada.stdout).modo, "estricto", "la entrada ausente devuelve fallback estricto también en JSON");
  const cliLigero = spawnSync(node, [join(RAIZ, "nucleo", "modo-ligero.mjs"), "analizar", "--stdin", "--json"], {
    cwd: CONSUMIDOR_SELECTOR, encoding: "utf8", input: JSON.stringify(entrada()), timeout: 10000,
  });
  assert.equal(cliLigero.status, 0, cliLigero.stderr);
  const salidaCliLigero = JSON.parse(cliLigero.stdout);
  assert.equal(salidaCliLigero.modo, "ligero", "el CLI acepta JSON por stdin desde un proyecto consumidor");
  assert.equal(salidaCliLigero.comandos[0], `node "${RUTA_PRUEBAS}" afectadas --json`, "la salida del CLI conserva paths absolutos del paquete fuera de su raíz");

  // Comprueba de extremo a extremo que el comando ya existente encuentra y
  // permite ejecutar la prueba importadora afectada, sin tocar el worktree.
  const repositorio = join(TEMP, "repo-sintetico");
  mkdirSync(join(repositorio, "src", "ui"), { recursive: true });
  mkdirSync(join(repositorio, "evals", "ui"), { recursive: true });
  writeFileSync(join(repositorio, ".gitignore"), ".fabrica/\n");
  writeFileSync(join(repositorio, "src", "ui", "etiqueta.mjs"), 'export const etiqueta = "Listo";\n');
  writeFileSync(join(repositorio, "evals", "ui", "etiqueta.test.mjs"), [
    'import assert from "node:assert/strict";',
    'import { etiqueta } from "../../src/ui/etiqueta.mjs";',
    'assert.equal(etiqueta, "Listo");',
  ].join("\n"));
  ejecutarGit(["init", "-q"], repositorio);
  ejecutarGit(["config", "user.name", "REPOFIBE eval"], repositorio);
  ejecutarGit(["config", "user.email", "eval@repofibe.invalid"], repositorio);
  ejecutarGit(["add", "-A"], repositorio);
  ejecutarGit(["commit", "-qm", "fixture base"], repositorio);
  writeFileSync(join(repositorio, "src", "ui", "etiqueta.mjs"), 'export const etiqueta = "Guardado";\n');

  // Ejecuta el script instalado usando ruta absoluta, pero con cwd en el repo
  // consumidor; pruebas.mjs debe leer ese Git y no el checkout de REPOFIBE.
  const seleccion = spawnSync(node, [RUTA_PRUEBAS, "afectadas", "--json"], {
    cwd: repositorio, encoding: "utf8", timeout: 15000,
  });
  assert.equal(seleccion.status, 0, seleccion.stderr);
  const listado = JSON.parse(seleccion.stdout);
  assert.ok(listado.cambiados.includes("src/ui/etiqueta.mjs"), "el script absoluto conserva cwd y lee los cambios del consumidor");
  assert.ok(listado.pruebas.includes("evals/ui/etiqueta.test.mjs"), "el grafo identifica la prueba que importa el módulo editado");

  writeFileSync(join(repositorio, "evals", "ui", "etiqueta.test.mjs"), [
    'import assert from "node:assert/strict";',
    'import { etiqueta } from "../../src/ui/etiqueta.mjs";',
    'assert.equal(etiqueta, "Guardado");',
  ].join("\n"));
  const prueba = spawnSync(node, [join(repositorio, "evals", "ui", "etiqueta.test.mjs")], {
    cwd: repositorio, encoding: "utf8", timeout: 10000,
  });
  assert.equal(prueba.status, 0, prueba.stderr || prueba.stdout);

  console.log("ok: ligero, seguridad/riesgo/configuración, áreas múltiples, evidencia ausente, rutas ajenas, rutas absolutas con espacios, cwd del consumidor, fallback estricto, pasos deterministas y prueba afectada ejecutada");
  console.log(`métricas: ligero=${ligera.tareas.length} pasos/${ligera.comandos.length} comandos; estricto=${ligera.comparacionDeterminista.pasosEstricto} pasos/${ligera.comparacionDeterminista.comandosEstricto} comandos; ahorro diseñado=${ligera.comparacionDeterminista.pasosMenosEnLigero} pasos (latencia no medida)`);
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
