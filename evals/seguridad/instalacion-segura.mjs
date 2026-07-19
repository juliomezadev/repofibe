#!/usr/bin/env node
// Pruebas regresivas del frente de seguridad.
// No usan la HOME real: cada caso trabaja contra un hogar y workspace temporales.

import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTALADOR = join(RAIZ, "nucleo", "instalar.mjs");
const SESION = join(RAIZ, "hooks", "sesion.mjs");

function ejecutar(args, hogar, cwd) {
  const entorno = {
    ...process.env,
    HOME: hogar,
    USERPROFILE: hogar,
    HOMEDRIVE: hogar.slice(0, 2),
    HOMEPATH: hogar.slice(2),
  };
  return spawnSync(process.execPath, [INSTALADOR, ...args], {
    cwd,
    env: entorno,
    encoding: "utf8",
  });
}

function exigirExito(resultado, contexto) {
  assert.equal(
    resultado.status,
    0,
    `${contexto} fallo:\n${resultado.stdout}\n${resultado.stderr}`,
  );
}

function probarContratoDeActualizacion() {
  const fuente = readFileSync(SESION, "utf8");
  assert.match(
    fuente,
    /auto_actualizar\s*===\s*true/,
    "la actualización automática debe requerir opt-in explícito",
  );
  assert.match(
    fuente,
    /status[\s\S]{0,120}--porcelain/,
    "la actualización automática debe comprobar el árbol limpio",
  );
  assert.match(
    fuente,
    /rev-parse[\s\S]{0,80}--show-toplevel/,
    "la actualización debe verificar la raíz real del repositorio",
  );
}

function probarOwnershipYDesinstalacion() {
  const temporal = mkdtempSync(join(tmpdir(), "repofibe-seguridad-"));
  const hogar = join(temporal, "hogar");
  const workspace = join(temporal, "workspace");
  const archivoUsuarioApp = join(hogar, ".repofibe", "app", "nucleo", "nota-usuario.txt");
  const archivoUsuarioSkill = join(workspace, ".agent", "skills", "repofibe-seguridad", "nota-usuario.txt");
  const archivoAgentes = join(workspace, "AGENTS.md");
  const archivoSkill = join(workspace, ".agent", "skills", "repofibe-seguridad", "SKILL.md");

  try {
    mkdirSync(dirname(archivoUsuarioApp), { recursive: true });
    mkdirSync(dirname(archivoUsuarioSkill), { recursive: true });
    writeFileSync(archivoUsuarioApp, "dato creado por el usuario\n", "utf8");
    writeFileSync(archivoUsuarioSkill, "no borrar\n", "utf8");
    writeFileSync(archivoAgentes, "# reglas del usuario\n", "utf8");

    let resultado = ejecutar(["--host", "generico", "--workspace", workspace], hogar, workspace);
    exigirExito(resultado, "instalación inicial");

    const registro = JSON.parse(readFileSync(join(hogar, ".repofibe", "instalado.json"), "utf8"));
    assert.ok(Array.isArray(registro.archivos) && registro.archivos.length > 0, "el registro debe tener ownership por archivo");

    writeFileSync(archivoSkill, `${readFileSync(archivoSkill, "utf8")}\nnota editada por el usuario\n`, "utf8");
    resultado = ejecutar(["--refrescar"], hogar, workspace);
    exigirExito(resultado, "refresco");
    assert.match(readFileSync(archivoSkill, "utf8"), /nota editada por el usuario/, "refrescar no debe pisar archivos modificados");

    resultado = ejecutar(["--quitar"], hogar, workspace);
    exigirExito(resultado, "desinstalación");
    assert.equal(readFileSync(archivoUsuarioApp, "utf8"), "dato creado por el usuario\n", "--quitar borro un archivo preexistente del núcleo");
    assert.equal(readFileSync(archivoUsuarioSkill, "utf8"), "no borrar\n", "--quitar borro un archivo preexistente de una skill");
    assert.match(readFileSync(archivoSkill, "utf8"), /nota editada por el usuario/, "--quitar debe conservar archivos propios modificados");
    assert.equal(readFileSync(archivoAgentes, "utf8"), "# reglas del usuario\n", "--quitar debe conservar el archivo de reglas del usuario");
    assert.ok(existsSync(join(workspace, ".agent", "skills", "repofibe-seguridad")), "no debe eliminar carpetas que contienen archivos del usuario");
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

probarContratoDeActualizacion();
probarOwnershipYDesinstalacion();
console.log("Seguridad: opt-in de actualización y ownership de instalación verificados.");
