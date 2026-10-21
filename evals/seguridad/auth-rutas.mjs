#!/usr/bin/env node
// Regresiones SA03: rutas de perfiles confinadas, nombres de host seguros e IDN.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { guardarEstado, cargar, dirAuth } from "../../nucleo/cookies.mjs";

const TEMP = mkdtempSync(join(process.cwd(), ".sa03-auth-rutas-"));
const state = { cookies: [], origins: [{ origin: "https://example.invalid", localStorage: [{ name: "token", value: "fixture" }] }] };

try {
  const base = join(TEMP, "proyecto");
  mkdirSync(base);

  assert.throws(
    () => guardarEstado("..\\..\\..\\fuera", state, base),
    /inv[aá]lid|origen|ruta|host/i,
    "un dominio con traversal Windows debe rechazarse antes de escribir"
  );

  assert.doesNotThrow(() => guardarEstado("CON", state, base), "los nombres reservados de Windows deben poder almacenarse con una ruta segura");
  assert.ok(cargar("con", base), "el host reservado se carga con el mismo identificador normalizado");
  assert.ok(!readdirSync(dirAuth(base)).some((name) => /^con(?:\\.|$)/i.test(name)), "el nombre de dispositivo no debe convertirse en filename de Windows");

  guardarEstado("https://bücher.example", state, base);
  assert.ok(cargar("https://xn--bcher-kva.example", base), "los dominios IDN y su forma punycode deben resolver al mismo origen");

  const baseConJunction = join(TEMP, "proyecto-junction");
  const fuera = join(TEMP, "directorio-fuera");
  mkdirSync(join(baseConJunction, ".fabrica"), { recursive: true });
  mkdirSync(fuera);
  let junctionDisponible = true;
  try {
    symlinkSync(fuera, join(baseConJunction, ".fabrica", "auth"), "junction");
  } catch (error) {
    junctionDisponible = false;
    console.log(`omitido: Windows no permitió crear junction de prueba (${error.code || error.message})`);
  }
  if (junctionDisponible) {
    assert.throws(() => guardarEstado("https://example.invalid", state, baseConJunction), /confin|symlink|junction|fuera|autentic/i);
    assert.equal(readdirSync(fuera).length, 0, "un junction hacia fuera no debe recibir el storageState");
  }

  // Si el path de destino ya es un symlink, escribirlo seguiría el enlace.
  // Se prueba con el nombre legado para que el fixture siga comprobando tanto
  // implementaciones que migran perfiles como lectores de perfiles existentes.
  const baseArchivoEnlazado = join(TEMP, "proyecto-archivo-enlazado");
  mkdirSync(dirAuth(baseArchivoEnlazado), { recursive: true });
  const destino = join(TEMP, "destino-link.json");
  const archivo = join(dirAuth(baseArchivoEnlazado), "example.invalid.json");
  writeSynthetic(destino, { sentinel: "antes" });
  try {
    symlinkSync(destino, archivo, "file");
    assert.throws(() => guardarEstado("example.invalid", state, baseArchivoEnlazado), /symlink|enlace|confin|ruta/i);
    assert.deepEqual(JSON.parse(readFileSync(destino, "utf8")), { sentinel: "antes" }, "no se debe seguir un enlace de archivo existente");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES" || error.code === "UNKNOWN") {
      console.log(`omitido: Windows no permitió crear symlink de archivo (${error.code})`);
    } else {
      throw error;
    }
  }

  console.log("ok: traversal Windows rechazado, host CON seguro, IDN canónico y enlaces confinados");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}

function writeSynthetic(path, value) {
  writeFileSync(path, JSON.stringify(value));
}
