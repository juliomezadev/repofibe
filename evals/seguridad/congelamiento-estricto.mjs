#!/usr/bin/env node
// Congelamiento estricto: solo rutas canonicas dentro del alcance permiten editar;
// Bash y PowerShell quedan bloqueados mientras el hook de Claude tiene un freeze.
import {
  mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const temporal = mkdtempSync(join(tmpdir(), "repofibe-congelamiento-"));
const fallos = [];

function preparar(nombre, congelamiento = '{"directorio":"src"}') {
  const raiz = join(temporal, nombre);
  mkdirSync(join(raiz, ".fabrica"), { recursive: true });
  mkdirSync(join(raiz, "src"), { recursive: true });
  mkdirSync(join(raiz, "outside"), { recursive: true });
  if (congelamiento !== null) {
    writeFileSync(join(raiz, ".fabrica", "congelar.json"), congelamiento, "utf8");
  }
  return raiz;
}

function decidir(raiz, tool, tool_input) {
  const r = spawnSync(process.execPath, [join(RAIZ, "hooks", "guardia.mjs")], {
    input: JSON.stringify({ tool_name: tool, tool_input, cwd: raiz }),
    encoding: "utf8",
    timeout: 15000,
  });
  if (r.status !== 0) return `ERROR(exit ${r.status})`;
  if (!r.stdout.trim()) return "permitir";
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch { return "ERROR(stdout ilegible)"; }
}

function verificar(raiz, descripcion, tool, input, esperado) {
  const real = decidir(raiz, tool, input);
  if (real !== esperado) fallos.push(`${descripcion}: esperaba ${esperado}, obtuvo ${real}`);
  else console.log(`  ok: ${descripcion} -> ${real}`);
}

{
  const raiz = preparar("rutas-exactas");
  verificar(raiz, "un archivo llamado guardia.json fuera de .fabrica se deniega", "Write", {
    file_path: join(raiz, "outside", "guardia.json"), content: '{"activo":true}',
  }, "deny");

  verificar(raiz, "un archivo llamado congelar.json fuera de .fabrica se deniega", "Write", {
    file_path: join(raiz, "outside", "congelar.json"), content: '{"directorio":"src"}',
  }, "deny");

  verificar(raiz, "la ruta operativa exacta de guardia permite conservar el estado", "Write", {
    file_path: join(raiz, ".fabrica", "guardia.json"), content: '{"activo":true}',
  }, "permitir");

  verificar(raiz, "la ruta relativa dentro del limite se resuelve desde cwd", "Write", {
    file_path: "src/relativo.txt", content: "x",
  }, "permitir");

  verificar(raiz, "la ruta relativa exacta de congelar se reconoce desde cwd", "Write", {
    file_path: ".fabrica/congelar.json", content: '{"directorio":"src"}',
  }, "permitir");

  verificar(raiz, "el traversal fuera del limite se deniega", "Write", {
    file_path: join(raiz, "src", "..", "outside", "traversal.txt"), content: "x",
  }, "deny");

  verificar(raiz, "una edicion dentro del limite se permite", "Write", {
    file_path: join(raiz, "src", "permitido.txt"), content: "x",
  }, "permitir");

  writeFileSync(join(raiz, ".fabrica", "guardia.json"), '{"activo":false}', "utf8");
  verificar(raiz, "Bash se deniega durante el congelamiento", "Bash", {
    command: "npm test",
  }, "deny");

  verificar(raiz, "PowerShell se deniega durante el congelamiento", "PowerShell", {
    command: "Get-Location",
  }, "deny");

  verificar(raiz, "las herramientas de lectura dedicadas siguen permitidas", "Read", {
    file_path: join(raiz, "outside", "guardia.json"),
  }, "permitir");
}

{
  const raiz = preparar("politica-invalida", "{json roto");
  verificar(raiz, "politica de congelamiento invalida bloquea Bash", "Bash", {
    command: "npm test",
  }, "deny");
  verificar(raiz, "politica invalida bloquea ediciones fuera de alcance desconocido", "Write", {
    file_path: join(raiz, "outside", "archivo.txt"), content: "x",
  }, "deny");
}

{
  const raiz = preparar("enlace-de-salida");
  const destino = join(raiz, "outside");
  const enlace = join(raiz, "src", "salida");
  const destinoInterno = join(raiz, "src", "interno");
  const enlaceInterno = join(raiz, "src", "alias-interno");
  mkdirSync(destinoInterno, { recursive: true });
  try {
    symlinkSync(destino, enlace, process.platform === "win32" ? "junction" : "dir");
    verificar(raiz, "una ruta dentro del arbol que enlaza fuera se deniega", "Write", {
      file_path: join(enlace, "archivo.txt"), content: "x",
    }, "deny");
  } catch (e) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(e.code)) {
      console.log(`  OMITIDO: el entorno no permite crear el enlace de salida (${e.code})`);
    } else {
      fallos.push(`crear el enlace de salida fallo inesperadamente: ${e.message}`);
    }
  }
  try {
    symlinkSync(destinoInterno, enlaceInterno, process.platform === "win32" ? "junction" : "dir");
    verificar(raiz, "un enlace cuya ruta real sigue dentro del limite se permite", "Write", {
      file_path: join(enlaceInterno, "archivo.txt"), content: "x",
    }, "permitir");
  } catch (e) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(e.code)) {
      console.log(`  OMITIDO: el entorno no permite crear el enlace interno (${e.code})`);
    } else {
      fallos.push(`crear el enlace interno fallo inesperadamente: ${e.message}`);
    }
  }
}

{
  const raiz = preparar("alias-fabrica", null);
  const alias = join(raiz, "alias-config");
  try {
    symlinkSync(join(raiz, ".fabrica"), alias, process.platform === "win32" ? "junction" : "dir");
    verificar(raiz, "un alias por enlace a .fabrica no recibe excepcion operativa", "Write", {
      file_path: join(alias, "guardia.json"), content: '{"activo":true}',
    }, "deny");
  } catch (e) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(e.code)) {
      console.log(`  OMITIDO: el entorno no permite crear el enlace de configuracion (${e.code})`);
    } else {
      fallos.push(`crear el enlace de configuracion fallo inesperadamente: ${e.message}`);
    }
  }
}

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  - ${f}`);
  rmSync(temporal, { recursive: true, force: true });
  process.exit(1);
}

rmSync(temporal, { recursive: true, force: true });
console.log("ok: congelamiento estricto verificado");
