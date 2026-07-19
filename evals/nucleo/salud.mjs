#!/usr/bin/env node
// Pruebas funcionales de nucleo/salud.mjs — punto 7 del PLAN-SUPERACION.md:
// el núcleo mecánico compartido de /desplegar y /canario (detección de
// proveedor, medición HTTP real, comparación contra línea base) deja de ser
// solo prosa en un SKILL.md y pasa a tener evidencia ejecutable.

import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { detectarProveedor, medirSalud, compararSalud } from "../../nucleo/salud.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function probarDeteccionProveedor() {
  const base = mkdtempSync(join(tmpdir(), "repofibe-salud-prov-"));
  try {
    mkdirSync(join(base, "vercel")); writeFileSync(join(base, "vercel", "vercel.json"), "{}");
    assert.equal(detectarProveedor(join(base, "vercel")).proveedor, "vercel");

    mkdirSync(join(base, "netlify")); writeFileSync(join(base, "netlify", "netlify.toml"), "");
    assert.equal(detectarProveedor(join(base, "netlify")).proveedor, "netlify");

    mkdirSync(join(base, "fly")); writeFileSync(join(base, "fly", "fly.toml"), "");
    assert.equal(detectarProveedor(join(base, "fly")).proveedor, "fly");

    mkdirSync(join(base, "pages", ".github", "workflows"), { recursive: true });
    writeFileSync(join(base, "pages", ".github", "workflows", "deploy.yml"), "uses: actions/deploy-pages@v4\n");
    assert.equal(detectarProveedor(join(base, "pages")).proveedor, "github-pages");

    mkdirSync(join(base, "vacio"));
    assert.equal(detectarProveedor(join(base, "vacio")).proveedor, "manual");
  } finally { rmSync(base, { recursive: true, force: true }); }
  console.log("ok: detectarProveedor (vercel/netlify/fly/github-pages/manual)");
}

async function probarMedicionYComparacion() {
  let modo = "ok";
  const servidor = createServer((req, res) => {
    if (modo === "ok") { res.writeHead(200, { "content-type": "text/plain" }); res.end("hola mundo"); }
    else if (modo === "error") { res.writeHead(500); res.end("error interno"); }
    else if (modo === "lento") { setTimeout(() => { res.writeHead(200); res.end("hola mundo, tarde"); }, 400); }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = servidor.address().port;
  const url = `http://127.0.0.1:${puerto}/`;

  try {
    // medirSalud contra el servidor real: código, tiempo y hash presentes.
    const m1 = await medirSalud(url);
    assert.equal(m1.ok, true);
    assert.equal(m1.codigo, 200);
    assert.equal(typeof m1.tiempoMs, "number");
    assert.equal(typeof m1.hashContenido, "string");

    // medirSalud contra un puerto que no escucha: falla con evidencia, no explota.
    const mFallo = await medirSalud("http://127.0.0.1:1/", "", 1500);
    assert.equal(mFallo.ok, false);
    assert.ok(mFallo.error, "debe traer el motivo del fallo");

    // compararSalud: casos puros, sin red — construidos a mano para ser deterministas.
    const base = { ok: true, codigo: 200, tiempoMs: 50, hashContenido: "aaa" };

    let v = compararSalud(base, { ok: true, codigo: 200, tiempoMs: 60, hashContenido: "aaa" });
    assert.equal(v.estado, "estable", "variación pequeña de latencia no debe ser regresión");

    v = compararSalud(base, { ok: true, codigo: 500, tiempoMs: 55, hashContenido: "aaa" });
    assert.equal(v.estado, "regresion");
    assert.ok(v.motivos.some((m) => m.includes("200") && m.includes("500")));

    v = compararSalud(base, { ok: true, codigo: 200, tiempoMs: 400, hashContenido: "aaa" });
    assert.equal(v.estado, "regresion", "8x más lento con salto absoluto grande debe marcar regresión");

    v = compararSalud(base, { ok: false, error: "timeout" });
    assert.equal(v.estado, "regresion");

    // Contenido cambiado SIN que el código empeore: informativo, NUNCA regresión
    // (fija en rojo el bug real que casi se shippea: hash distinto ≠ regresión).
    v = compararSalud(base, { ok: true, codigo: 200, tiempoMs: 55, hashContenido: "bbb" });
    assert.equal(v.estado, "estable", "contenido cambiado con código sano no es regresión");
    assert.equal(v.contenidoCambio, true);

    // Medición real end-to-end: base sana → actual con error real del servidor.
    const medidaBase = await medirSalud(url);
    modo = "error";
    const medidaActual = await medirSalud(url);
    const veredicto = compararSalud(medidaBase, medidaActual);
    assert.equal(veredicto.estado, "regresion");
  } finally {
    await new Promise((r) => servidor.close(r));
  }
  console.log("ok: medirSalud (HTTP real, éxito y fallo) y compararSalud (estable/regresión/contenido informativo)");
}

probarDeteccionProveedor();
await probarMedicionYComparacion();
console.log("Salud: detección de proveedor, medición HTTP real y comparación contra línea base verificadas.");
