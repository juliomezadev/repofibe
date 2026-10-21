#!/usr/bin/env node
// Regresiones del estado efectivo de guardia.json y congelar.json.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const temporal = mkdtempSync(join(tmpdir(), "repofibe-guardia-config-"));
const fallos = [];

function casa(nombre) {
  const raiz = join(temporal, nombre);
  mkdirSync(join(raiz, ".fabrica"), { recursive: true });
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
  const raiz = casa("edicion-parcial");
  const archivo = join(raiz, ".fabrica", "guardia.json");
  writeFileSync(archivo, '{"activo": true}', "utf8");

  verificar(raiz, "Edit parcial true -> false consulta al usuario", "Edit", {
    file_path: archivo, old_string: "true", new_string: "false",
  }, "ask");

  verificar(raiz, "MultiEdit parcial true -> false consulta al usuario", "MultiEdit", {
    file_path: archivo,
    edits: [{ old_string: "true", new_string: "false" }],
  }, "ask");

  verificar(raiz, "un Write completo que apaga el guardia consulta", "Write", {
    file_path: archivo, content: '{"activo": false}',
  }, "ask");
}

{
  const raiz = casa("cambio-de-alcance");
  mkdirSync(join(raiz, "src", "lib", "api"), { recursive: true });
  mkdirSync(join(raiz, "docs"), { recursive: true });
  const archivo = join(raiz, ".fabrica", "congelar.json");
  writeFileSync(archivo, '{"directorio":"src/lib"}', "utf8");

  verificar(raiz, "ensanchar congelamiento de src/lib a src consulta", "Edit", {
    file_path: archivo,
    old_string: '"src/lib"',
    new_string: '"src"',
  }, "ask");

  verificar(raiz, "mover congelamiento a un arbol disjunto consulta", "Write", {
    file_path: archivo, content: '{"directorio":"docs"}',
  }, "ask");

  verificar(raiz, "estrechar congelamiento de src/lib a src/lib/api permite", "Write", {
    file_path: archivo, content: '{"directorio":"src/lib/api"}',
  }, "permitir");
}

{
  const raiz = casa("guardia-invalida");
  const archivo = join(raiz, ".fabrica", "guardia.json");
  writeFileSync(archivo, '{"activo":', "utf8");

  verificar(raiz, "guardia.json malformado bloquea Bash", "Bash", {
    command: "npm test",
  }, "deny");

  verificar(raiz, "reparar guardia.json a activo permite", "Edit", {
    file_path: archivo,
    old_string: '{"activo":',
    new_string: '{"activo": true}',
  }, "permitir");
}

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  - ${f}`);
  rmSync(temporal, { recursive: true, force: true });
  process.exit(1);
}

rmSync(temporal, { recursive: true, force: true });
console.log("ok: el guardia compara el efecto completo de Edit, MultiEdit y Write");
