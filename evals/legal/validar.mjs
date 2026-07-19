#!/usr/bin/env node
// Eval legal local: valida el contrato documental sin acceder a internet.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = join(RAIZ, "skills", "legal", "SKILL.md");
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixture-respuesta-minima.json");
const fallos = [];
const exigir = (condicion, mensaje) => { if (!condicion) fallos.push(mensaje); };

exigir(existsSync(skillPath), "falta skills/legal/SKILL.md");
exigir(existsSync(fixturePath), "falta fixture-respuesta-minima.json");

const skill = readFileSync(skillPath, "utf8");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

for (const fragmento of [
  "Hechos",
  "Jurisdicción",
  "Fuentes oficiales verificadas",
  "fecha de verificación",
  "vigencia",
  "Norma del mapa",
  "Inferencia y límites",
  "Nivel de confianza",
  "verifícalo con abogado colombiano",
  "suin-juriscol.gov.co",
  "sic.gov.co",
  "dian.gov.co",
  "derechodeautor.gov.co",
  "comunidadandina.org"
]) exigir(skill.includes(fragmento), `falta control documental: ${fragmento}`);

// El mapa existente debe mantenerse: esta eval no permite que el frente
// documental se convierta en una lista nueva de normas inventadas.
for (const entrada of [
  "Ley 1581/2012",
  "Ley 1266/2008",
  "Ley 1273/2009",
  "Ley 527/1999",
  "Ley 1480/2011",
  "Ley 23/1982",
  "Decisión Andina 351/1993"
]) exigir(skill.includes(entrada), `se perdió la entrada existente del mapa: ${entrada}`);

// No debe quedar la afirmación de integración automática con plugins legales.
for (const patron of [
  /Se integra con los plugins legales del host/i,
  /privacy-legal/i,
  /ÚSALOS como motor del análisis/i
]) exigir(!patron.test(skill), `permanece una afirmación de integración automática: ${patron}`);

const hostsAllowlisted = new Set([
  "suin-juriscol.gov.co",
  "sic.gov.co",
  "dian.gov.co",
  "derechodeautor.gov.co",
  "comunidadandina.org"
]);
const esHostAllowlisted = (url) => {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && [...hostsAllowlisted].some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
  );
};

const fuentes = fixture.fuentes_oficiales_verificadas;
exigir(Array.isArray(fuentes) && fuentes.length > 0, "el fixture debe tener fuentes oficiales");
for (const fuente of fuentes ?? []) {
  exigir(typeof fuente.autoridad === "string" && fuente.autoridad.length > 0, "fuente sin autoridad");
  exigir(typeof fuente.titulo === "string" && fuente.titulo.length > 0, "fuente sin título");
  exigir(esHostAllowlisted(fuente.url), `URL fuera de la allowlist: ${fuente.url}`);
  exigir(/^\d{4}-\d{2}-\d{2}$/.test(fuente.fecha_verificacion), "fecha de verificación no ISO");
  exigir(["vigente", "modificada", "derogada", "no vigente", "no aplica", "no verificada"].includes(fuente.vigencia), "vigencia inválida");
}

for (const campo of ["hechos", "jurisdiccion", "norma_del_mapa", "inferencia", "riesgo", "nivel_de_confianza", "escalamiento_a_abogado"]) {
  exigir(Object.prototype.hasOwnProperty.call(fixture, campo), `fixture sin campo obligatorio: ${campo}`);
}
exigir(fixture.escalamiento_a_abogado === true, "el fixture debe demostrar el escalamiento a abogado");
exigir(fixture.riesgo === "no concluyente", "el caso sin verificación debe quedar no concluyente");
exigir(fixture.nivel_de_confianza === "bajo", "el caso sin verificación debe tener confianza baja");

if (fallos.length) {
  console.error(`FALLOS (${fallos.length}):`);
  for (const fallo of fallos) console.error(`  ✗ ${fallo}`);
  process.exit(1);
}

console.log("OK: contrato legal, mapa preservado, allowlist y fixture sin red");
