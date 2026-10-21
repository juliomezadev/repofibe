#!/usr/bin/env node
// Regresión F07/F15: transacciones completas del sprint y archivo verificable.
// Cada mutación corre en un proceso CLI independiente contra un .fabrica temporal.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const ESTADO = join(RAIZ, "nucleo", "estado.mjs");
const TEMP = mkdtempSync(join(tmpdir(), "repofibe-estado-transaccion-"));
const FABRICA = join(TEMP, ".fabrica");
const SPRINT = join(FABRICA, "sprint.json");
const entorno = { ...process.env, REPOFIBE_SYNC_HOME: join(TEMP, "sync"), REPOFIBE_TRAZA_DIR: join(TEMP, "trazas") };

function ejecutar(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ESTADO, ...args], { cwd: TEMP, env: entorno, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`estado ${args.join(" ")} exit=${code}: ${stdout}${stderr}`)));
  });
}

function crearSprint(objetivo = "base") {
  mkdirSync(FABRICA, { recursive: true });
  const sprint = {
    version: 1,
    objetivo,
    etapa: "construir",
    plan: null,
    historial: [],
    pendientes: [],
    creado: "2026-01-01T00:00:00.000Z",
    actualizado: "2026-01-01T00:00:00.000Z",
    extensionProveedor: { preservar: true, ruta: "C:\\Users\\Ana\\proyecto", multilinea: "primera\nsegunda" },
  };
  const bytes = JSON.stringify(sprint, null, 2) + "\n";
  writeFileSync(SPRINT, bytes, "utf8");
  return bytes;
}

try {
  crearSprint();
  for (let ronda = 0; ronda < 3; ronda++) {
    const resultados = await Promise.allSettled(Array.from({ length: 10 }, (_, escritor) => ejecutar("registrar", `r${ronda}-w${escritor}`, `evento-${ronda}-${escritor}`)));
    const fallidos = resultados.filter((r) => r.status === "rejected");
    assert.equal(fallidos.length, 0, `${fallidos.length} escritores concurrentes fallaron: ${fallidos.map((r) => r.reason.message).join(" | ")}`);
  }
  let guardado = JSON.parse(readFileSync(SPRINT, "utf8"));
  assert.equal(guardado.historial.length, 30, "10 escritores x 3 rondas deben quedar todos registrados");
  assert.equal(new Set(guardado.historial.map((evento) => evento.skill)).size, 30, "cada transacción debe conservar su evento único");
  assert.deepEqual(guardado.extensionProveedor, { preservar: true, ruta: "C:\\Users\\Ana\\proyecto", multilinea: "primera\nsegunda" }, "los campos desconocidos y sus escapes sobreviven una mutación");

  // Un JSON roto nunca se reemplaza ni se archiva como si fuera un sprint válido.
  const invalido = "{ sprint truncado con ruta C:\\Users\\Ana";
  writeFileSync(SPRINT, invalido, "utf8");
  await assert.rejects(() => ejecutar("pendiente", "no debe escribirse"), /JSON|inválido/i);
  assert.equal(readFileSync(SPRINT, "utf8"), invalido, "el archivo inválido queda byte por byte intacto");
  assert.equal(existsSync(join(FABRICA, "sprints")), false, "no se archiva un estado inválido");

  // Matar al proceso con el lock en mano deja un propietario muerto verificable.
  crearSprint("recuperación tras proceso terminado");
  const lock = `${SPRINT}.lock`;
  const moduloPersistencia = pathToFileURL(join(RAIZ, "nucleo", "persistencia.mjs")).href;
  const scriptBloqueado = `import { conBloqueoExclusivoSync } from ${JSON.stringify(moduloPersistencia)}; conBloqueoExclusivoSync(process.argv[1], () => { process.stdout.write("LOCKED\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); });`;
  const bloqueado = spawn(process.execPath, ["--input-type=module", "-e", scriptBloqueado, lock], { cwd: TEMP, env: entorno, stdio: ["ignore", "pipe", "pipe"] });
  let salidaHijo = "";
  bloqueado.stdout.setEncoding("utf8").on("data", (chunk) => { salidaHijo += chunk; });
  await new Promise((resolve, reject) => {
    const tiempo = setTimeout(() => reject(new Error("el proceso de prueba no tomó el lock")), 5000);
    bloqueado.stdout.on("data", (chunk) => {
      if (`${salidaHijo}${chunk}`.includes("LOCKED")) { clearTimeout(tiempo); resolve(); }
    });
    bloqueado.once("error", (error) => { clearTimeout(tiempo); reject(error); });
    bloqueado.once("close", (code) => { clearTimeout(tiempo); if (code !== null && !salidaHijo.includes("LOCKED")) reject(new Error(`proceso de lock terminó prematuramente (${code})`)); });
  });
  assert.equal(existsSync(lock), true, "el hijo mantiene un lock verificable mientras su transacción está activa");
  bloqueado.kill();
  await new Promise((resolve) => bloqueado.once("close", resolve));
  assert.equal(existsSync(lock), true, "la terminación abrupta conserva la señal del dueño muerto para recuperación");
  await ejecutar("pendiente", "recuperado sin pérdida");
  guardado = JSON.parse(readFileSync(SPRINT, "utf8"));
  assert.deepEqual(guardado.pendientes, ["recuperado sin pérdida"]);
  assert.equal(existsSync(lock), false, "la recuperación de dueño muerto libera el lock anterior");

  await ejecutar("etapa", "retro");
  const before = readFileSync(SPRINT);
  const digest = createHash("sha256").update(before).digest("hex");
  await ejecutar("iniciar", "sprint nuevo terminado");
  const archivo = join(FABRICA, "sprints", `${digest}.json`);
  assert.equal(readFileSync(archivo).toString(), before.toString(), "el sprint completado se archiva antes de reemplazarlo y byte por byte");
  // Repetir el mismo contenido archivado es idempotente: conserva un archivo por identidad.
  writeFileSync(SPRINT, before);
  await ejecutar("iniciar", "otro sprint");
  assert.equal(readdirSync(join(FABRICA, "sprints")).filter((n) => n === `${digest}.json`).length, 1);

  // Lock con identidad/host desconocido: no se roba y expira con error acotado.
  const { conBloqueoExclusivoSync } = await import("../../nucleo/persistencia.mjs");
  const desconocido = join(FABRICA, "desconocido.lock");
  const descriptor = { token: "no-reclamar", pid: 42, hostname: "host-que-no-es-este" };
  writeFileSync(desconocido, JSON.stringify(descriptor), { flag: "wx" });
  assert.throws(() => conBloqueoExclusivoSync(desconocido, () => assert.fail("no debe entrar"), { timeoutMs: 80, pollMs: 5 }), /lock|bloqueo|recuperación/i);
  assert.deepEqual(JSON.parse(readFileSync(desconocido, "utf8")), descriptor, "un lock desconocido no se modifica");
  const corrupto = join(FABRICA, "corrupto.lock");
  const bytesCorruptos = "owner json truncado {";
  writeFileSync(corrupto, bytesCorruptos, "utf8");
  assert.throws(() => conBloqueoExclusivoSync(corrupto, () => assert.fail("no debe entrar"), { timeoutMs: 80, pollMs: 5 }), /lock|bloqueo|recuperación/i);
  assert.equal(readFileSync(corrupto, "utf8"), bytesCorruptos, "el lock corrupto se conserva para recuperación explícita");
  console.log("ok: estado serializado (10 x 3), fallo inválido sin pérdida, lock muerto/ajeno, campos extra y archivo idempotente");
} finally {
  rmSync(TEMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
