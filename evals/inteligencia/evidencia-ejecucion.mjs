#!/usr/bin/env node
// Regresiones F14: gates de prueba requieren recibos operacionales vigentes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { crearEvidencia, crearPlan, crearTarea, validarEvidencia } from "../../nucleo/inteligencia/contratos.mjs";
import { validarEstado } from "../../nucleo/inteligencia/evidencia.mjs";
import { ejecutarPrueba } from "../../nucleo/inteligencia/ejecuciones.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-evidencia-ejecucion-"));
const git = (args) => execFileSync("git", args, { cwd: TEMP, stdio: "ignore" });
const tarea = crearTarea({ id: "t-ejecucion", objetivo: "Validar una suite local", modo: "autonomo" });
const plan = crearPlan({
  id: "p-ejecucion", tarea, intencion: "qa", modo: tarea.modo, accion: "lectura",
  pasos: [{ id: "p1", descripcion: "Ejecutar pruebas", estado: "completado" }],
  gates: [{ id: "tests", tipo: "prueba", descripcion: "Suite local en verde" }],
});
plan.estado = "completado";
const estado = (evidencias, workspace = TEMP) => validarEstado({ tarea, plan, evidencias, workspace });

try {
  git(["init", "-q"]);
  git(["config", "user.name", "eval"]);
  git(["config", "user.email", "eval@repofibe.local"]);
  writeFileSync(join(TEMP, "src.mjs"), "export const valor = 1;\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "fixture"]);

  const buena = await ejecutarPrueba({
    gateId: "tests", comando: process.execPath,
    args: ["-e", "process.stdout.write('ghp_abcdefghijklmnopqrstuvwxyz1234567890AB')"], cwd: TEMP,
  });
  assert.equal(buena.recibo.exitCode, 0);
  assert.equal(buena.evidencia.version, 2);
  assert.equal(buena.evidencia.procedencia, "observada");
  assert.equal(validarEvidencia(buena.evidencia).valido, true);
  assert.equal(estado([buena.evidencia]).completo, true, "recibo actual del mismo gate/workspace permite cerrar");
  assert.match(readFileSync(join(TEMP, buena.recibo.logs.stdout.ruta), "utf8"), /REDACTADO/);
  const argsAlterados = { ...buena.evidencia, ejecucionRef: { ...buena.evidencia.ejecucionRef, argsSha256: "f".repeat(64) } };
  assert.equal(estado([argsAlterados]).completo, false, "argumentos distintos al recibo no cubren el gate");
  assert.equal(estado([buena.evidencia], process.cwd()).completo, false, "un recibo de otro workspace no cubre el gate");
  const ausente = { ...buena.evidencia, ejecucionRef: { runId: "run-00000000-0000-0000-0000-000000000000", sha256Recibo: "0".repeat(64) } };
  assert.equal(estado([ausente]).completo, false, "una referencia sin recibo íntegro no cubre el gate");

  const tipoIncorrecto = crearEvidencia({ gateId: "tests", tipo: "resultado", fuente: "agente", exito: true });
  assert.equal(estado([tipoIncorrecto]).completo, false, "evidencia declarada o de tipo incorrecto no cierra gate de prueba");
  const legado = { ...tipoIncorrecto, version: 1, tipo: "prueba", exito: true, exitCode: 0 };
  assert.equal(validarEvidencia(legado).valido, true, "evidencia v1 sigue siendo legible");
  assert.equal(estado([legado]).completo, false, "evidencia v1 declarativa no cierra gate de prueba");

  const fallo = await ejecutarPrueba({ gateId: "tests", comando: process.execPath, args: ["-e", "process.exit(7)"], cwd: TEMP });
  assert.equal(fallo.evidencia.exito, false);
  assert.equal(estado([fallo.evidencia]).completo, false, "exitCode distinto de cero no cierra el gate");
  assert.notEqual(fallo.recibo.runId, buena.recibo.runId, "cada ejecución crea su propio recibo");
  assert.equal(existsSync(fallo.reciboPath), true, "la ejecución fallida también conserva su recibo");

  const reciboCambiado = { ...buena.evidencia, gateId: "otro-gate" };
  assert.equal(estado([reciboCambiado]).completo, false, "recibo de otro gate no cubre el gate requerido");
  const reciboPath = join(TEMP, ".fabrica", "ejecuciones", `${buena.recibo.runId}.json`);
  const bytes = readFileSync(reciboPath, "utf8");
  writeFileSync(reciboPath, bytes.replace(buena.recibo.argsSha256, "a".repeat(64)));
  assert.equal(estado([buena.evidencia]).completo, false, "modificar los argumentos del recibo invalida su integridad");
  writeFileSync(reciboPath, bytes);
  writeFileSync(reciboPath, bytes.replace('"exitCode": 0', '"exitCode": 1'));
  assert.equal(estado([buena.evidencia]).completo, false, "recibo alterado no conserva su integridad");
  writeFileSync(reciboPath, bytes);

  writeFileSync(join(TEMP, "src.mjs"), "export const valor = 2;\n");
  assert.equal(estado([buena.evidencia]).completo, false, "cambiar una fuente invalida la evidencia previa");
  assert.equal(existsSync(reciboPath), true, "los recibos previos no se sobrescriben por otra ejecución");

  await assert.rejects(() => ejecutarPrueba({ gateId: "tests", comando: "git", args: ["push", "origin", "main"], cwd: TEMP }), /no permitido/i);

  const temporalJunction = mkdtempSync(join(tmpdir(), "repofibe-ejecucion-junction-"));
  const fuera = mkdtempSync(join(tmpdir(), "repofibe-ejecucion-fuera-"));
  const marker = join(fuera, "no-ejecutar.txt");
  const junction = join(temporalJunction, ".fabrica", "ejecuciones");
  try {
    execFileSync("git", ["init", "-q"], { cwd: temporalJunction, stdio: "ignore" });
    execFileSync("git", ["-C", temporalJunction, "config", "user.name", "eval"], { stdio: "ignore" });
    execFileSync("git", ["-C", temporalJunction, "config", "user.email", "eval@repofibe.local"], { stdio: "ignore" });
    writeFileSync(join(temporalJunction, "src.mjs"), "export const value = 1;\n");
    execFileSync("git", ["-C", temporalJunction, "add", "-A"], { stdio: "ignore" });
    execFileSync("git", ["-C", temporalJunction, "commit", "-qm", "fixture"], { stdio: "ignore" });
    mkdirSync(join(temporalJunction, ".fabrica"));
    symlinkSync(fuera, junction, "junction");
    await assert.rejects(() => ejecutarPrueba({
      gateId: "tests", comando: process.execPath,
      args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ejecutado')`], cwd: temporalJunction,
    }), /inseguro|fuera del workspace/i, "una junction de almacenamiento se rechaza antes de ejecutar");
    assert.equal(existsSync(marker), false, "el runner no ejecuta si el destino del recibo sale del workspace");
    unlinkSync(junction);
  } finally {
    if (existsSync(junction)) unlinkSync(junction);
    rmSync(temporalJunction, { recursive: true, force: true });
    rmSync(fuera, { recursive: true, force: true });
  }

  console.log("ok: recibo v1, argumentos, integridad, tipo, gate, ausencia, exitCode, fuentes, logs redactados y junction segura");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
