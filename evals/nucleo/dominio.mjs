#!/usr/bin/env node
// Pruebas funcionales de nucleo/dominio.mjs — domain-skills persistentes.

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmp = mkdtempSync(join(tmpdir(), "repofibe-dominio-"));
const cwdOriginal = process.cwd();
process.chdir(tmp);

try {
  const { agregar, listar, usar, retirar } = await import("../../nucleo/dominio.mjs");

  // Normalización de dominio: con protocolo, sin protocolo, con ruta — mismo resultado.
  const n1 = agregar("https://Ejemplo.com/pagina", "el precio vive en .price");
  assert.equal(n1.dominio, "ejemplo.com", "debía normalizar host en minúsculas sin ruta");
  assert.equal(n1.estado, "cuarentena");
  assert.equal(n1.usos, 0);

  let notas = listar("ejemplo.com");
  assert.equal(notas.length, 1);
  notas = listar("EJEMPLO.COM"); // mismo dominio, otra capitalización
  assert.equal(notas.length, 1, "listar debía encontrar la nota sin importar mayúsculas");

  // Ciclo de confianza: cuarentena → 3 usos → activa.
  usar("ejemplo.com", n1.id);
  let actual = usar("ejemplo.com", n1.id);
  assert.equal(actual.estado, "cuarentena", "con 2 usos aún debía estar en cuarentena");
  actual = usar("ejemplo.com", n1.id);
  assert.equal(actual.usos, 3);
  assert.equal(actual.estado, "activa", "al tercer uso debía promoverse a activa");

  // Un cuarto uso no debe romper nada ni "des-promover".
  actual = usar("ejemplo.com", n1.id);
  assert.equal(actual.usos, 4);
  assert.equal(actual.estado, "activa");

  // Dominios distintos no se mezclan.
  agregar("otro-sitio.com", "el login usa un iframe");
  assert.equal(listar("ejemplo.com").length, 1);
  assert.equal(listar("otro-sitio.com").length, 1);

  // Retirar oculta la nota de listar() sin borrar el historial del archivo.
  const retirada = retirar("ejemplo.com", n1.id);
  assert.equal(retirada.estado, "retirada");
  assert.equal(listar("ejemplo.com").length, 0, "una nota retirada no debe aparecer en listar()");

  console.log("ok: ciclo completo (normalización de dominio, cuarentena→activa a los 3 usos, aislamiento entre dominios, retiro)");
} finally {
  process.chdir(cwdOriginal);
  rmSync(tmp, { recursive: true, force: true });
}

console.log("Dominio: domain-skills con ciclo de confianza cuarentena→activa verificado.");
