#!/usr/bin/env node
// Validador semántico del contrato operativo de cierre de skills.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const CATEGORIAS = ["MUST_REGISTER", "MAY_REGISTER", "MUST_NOT_REGISTER"];
const SKILLS_REQUERIDAS = ["contexto", "memoria", "pruebas-afectadas", "qaonline", "ubicar"];

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function cargar(raiz) {
  const ruta = join(raiz, "plantillas", "contrato-cierre.json");
  return JSON.parse(readFileSync(ruta, "utf8"));
}

export function validarContrato(raiz) {
  const errores = [];
  let contrato;
  try { contrato = cargar(raiz); }
  catch (e) { return { valido: false, errores: [`contrato ilegible: ${e.message}`] }; }

  if (contrato.version !== 1) errores.push("version de contrato no soportada");
  if (contrato.fuente !== "plantillas/preambulo.md" || !existsSync(join(raiz, contrato.fuente))) {
    errores.push("fuente canónica ausente o incorrecta");
  }
  if (!contrato.comando?.includes("estado.mjs registrar <skill>")) errores.push("plantilla de comando rota");
  const politica = contrato.politica;
  if (!politica || typeof politica !== "object" || Array.isArray(politica)) return { valido: false, errores: [...errores, "politica ausente o no estructurada"] };
  if (JSON.stringify(Object.keys(politica).sort()) !== JSON.stringify([...SKILLS_REQUERIDAS].sort())) {
    errores.push("el conjunto de skills del contrato no coincide con el requerido");
  }

  for (const skill of SKILLS_REQUERIDAS) {
    const regla = politica[skill];
    if (!regla || typeof regla !== "object" || Array.isArray(regla)) {
      errores.push(`${skill}: regla ausente o no estructurada`);
      continue;
    }
    const vistas = new Set();
    for (const categoria of CATEGORIAS) {
      if (!Array.isArray(regla[categoria])) {
        errores.push(`${skill}: ${categoria} debe ser lista`);
        continue;
      }
      for (const accion of regla[categoria]) {
        const clave = normalizar(accion);
        if (vistas.has(clave)) errores.push(`${skill}: accion duplicada entre categorías (${accion})`);
        vistas.add(clave);
      }
    }

    const ruta = join(raiz, "skills", skill, "SKILL.md");
    if (!existsSync(ruta)) {
      errores.push(`${skill}: SKILL.md ausente`);
      continue;
    }
    const texto = readFileSync(ruta, "utf8");
    const cierres = texto.match(/^## Contrato de cierre$/gm) ?? [];
    if (cierres.length !== 1) errores.push(`${skill}: cierre ausente o duplicado`);
    if (!texto.includes("plantillas/contrato-cierre.json")) errores.push(`${skill}: no referencia la fuente operativa`);
    for (const categoria of CATEGORIAS) {
      if (regla[categoria].length > 0 && !texto.includes(`\`${categoria}\``) && !texto.includes(`**${categoria}**`)) {
        errores.push(`${skill}: no declara ${categoria}`);
      }
      for (const accion of regla[categoria] ?? []) {
        if (!normalizar(texto).includes(normalizar(accion))) errores.push(`${skill}: no documenta la acción ${accion}`);
      }
    }

    const comandos = [...texto.matchAll(/node <RAIZ>\/nucleo\/estado\.mjs registrar\s+([^\s"]+)\s+"<resultado en una l[ií]nea>"/g)]
      .map((match) => match[1]);
    if (new Set(comandos).size !== comandos.length) errores.push(`${skill}: cierre duplicado`);
    if (regla.MUST_REGISTER.length > 0 && comandos.length === 0) errores.push(`${skill}: requiere cierre pero no tiene comando`);
    if (comandos.some((comando) => comando !== skill)) errores.push(`${skill}: comando de cierre roto o de otra skill`);
    if (regla.MUST_REGISTER.length === 0 && comandos.length > 0) errores.push(`${skill}: registra sin una acción MUST_REGISTER`);
    for (const accion of regla.MUST_NOT_REGISTER) {
      if (!normalizar(texto).includes(normalizar(accion))) errores.push(`${skill}: excepción no documentada (${accion})`);
    }
  }
  return { valido: errores.length === 0, errores, contrato };
}

function crearFixture(raiz, base, skill, transformar = (texto) => texto) {
  mkdirSync(join(raiz, "plantillas"), { recursive: true });
  mkdirSync(join(raiz, "skills", skill), { recursive: true });
  writeFileSync(join(raiz, "plantillas", "contrato-cierre.json"), readFileSync(join(base, "plantillas", "contrato-cierre.json")));
  writeFileSync(join(raiz, "plantillas", "preambulo.md"), "fuente");
  for (const nombre of SKILLS_REQUERIDAS) {
    mkdirSync(join(raiz, "skills", nombre), { recursive: true });
    const texto = readFileSync(join(base, "skills", nombre, "SKILL.md"), "utf8");
    writeFileSync(join(raiz, "skills", nombre, "SKILL.md"), nombre === skill ? transformar(texto) : texto);
  }
}

async function main() {
  const raiz = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const resultado = validarContrato(raiz);
  assert.equal(resultado.valido, true, resultado.errores.join("\n"));

  const temp = mkdtempSync(join(tmpdir(), "repofibe-contrato-"));
  try {
    crearFixture(temp, raiz, "ubicar", (texto) => texto.replace("## Contrato de cierre", "## Contrato de cierre\n\n## Contrato de cierre"));
    assert.equal(validarContrato(temp).valido, false, "debe detectar cierre duplicado");

    crearFixture(temp, raiz, "qaonline", (texto) => texto.replace("estado.mjs registrar qaonline", "estado.mjs registrar roto"));
    assert.equal(validarContrato(temp).valido, false, "debe detectar comando roto");

    crearFixture(temp, raiz, "pruebas-afectadas", (texto) => texto.replace("## Contrato de cierre", "## Contrato de cierre ausente"));
    assert.equal(validarContrato(temp).valido, false, "debe detectar skill sin cierre");

    const excepcion = validarContrato(raiz);
    assert.equal(excepcion.valido, true, "la excepción MUST_NOT_REGISTER declarada debe ser válida");
    console.log("ok: contrato de cierre detecta ausencia, duplicados, comandos rotos y acepta excepciones declaradas");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
