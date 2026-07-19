#!/usr/bin/env node
// Pruebas funcionales de nucleo/benchmark.mjs. compararVitales() se prueba
// siempre (función pura, cero deps). medirVitales() con Chromium real SOLO
// si Playwright está instalado — repofibe sigue siendo cero-deps, igual
// que evals/nucleo/navegador.mjs.

import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { compararVitales, medirVitales } from "../../nucleo/benchmark.mjs";

function probarCompararVitales() {
  const base = { ok: true, lcpMs: 1000, cls: 0.02, ttfbMs: 100 };

  let v = compararVitales(base, { ok: true, lcpMs: 1100, cls: 0.03, ttfbMs: 110 });
  assert.equal(v.estado, "estable", "variación pequeña no debía ser regresión");

  v = compararVitales(base, { ok: true, lcpMs: 2000, cls: 0.02, ttfbMs: 100 });
  assert.equal(v.estado, "regresion", "LCP duplicado con salto absoluto grande debía marcar regresión");
  assert.ok(v.motivos.some((m) => m.includes("LCP")));

  v = compararVitales(base, { ok: true, lcpMs: 1000, cls: 0.35, ttfbMs: 100 });
  assert.equal(v.estado, "regresion", "CLS que cruza el umbral 0.1 debía marcar regresión");

  v = compararVitales(base, { ok: false, error: "timeout" });
  assert.equal(v.estado, "regresion");

  console.log("ok: compararVitales (estable, LCP degradado, CLS degradado, medición fallida)");
}

async function probarMedirVitalesSiHayPlaywright() {
  let disponible = true;
  try { await import("playwright"); } catch { disponible = false; }
  if (!disponible) {
    console.log("omitido: playwright no está instalado en este proyecto (repofibe es cero-deps) — instala con `npm install playwright && npx playwright install chromium` para correr esta prueba de integración real");
    return;
  }

  const servidor = createServer((req, res) => {
    if (req.url === "/estilo.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end("h1 { color: blue; }");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/estilo.css"></head><body>
      <h1 style="font-size:3rem">Contenido principal</h1>
      <p>Página de prueba para benchmark.</p>
    </body></html>`);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${servidor.address().port}/`;

  try {
    const r = await medirVitales(url, { esperaMs: 500 });
    assert.equal(r.ok, true, `medición debía tener éxito: ${r.error}`);
    assert.equal(typeof r.lcpMs, "number", "LCP debía ser un número real medido por Chromium");
    assert.equal(typeof r.cls, "number");
    assert.ok(r.cls >= 0, "CLS no puede ser negativo");
    assert.equal(typeof r.ttfbMs, "number");
    // La entrada "resource" de la Performance API NO incluye el documento
    // HTML principal (eso vive en la entrada "navigation", capturada
    // aparte) — solo subrecursos. Esta página de prueba no tiene ninguno,
    // así que 0 es el valor CORRECTO, no un fallo de medición.
    assert.equal(r.recursos, 1, "debía contar exactamente 1 subrecurso (estilo.css) — el documento HTML no cuenta como 'resource'");
    assert.ok(r.bytesTransferidos > 0, "bytesTransferidos debía reflejar la transferencia real de estilo.css");

    const rFallo = await medirVitales("http://127.0.0.1:1/", { timeoutMs: 2000 });
    assert.equal(rFallo.ok, false, "un puerto que no escucha debía fallar con evidencia, no explotar");
    assert.ok(rFallo.error);

    console.log(`ok: medirVitales end-to-end con Chromium real (LCP ${Math.round(r.lcpMs)}ms, CLS ${r.cls.toFixed(3)}, ${r.recursos} recursos) y fallo controlado ante URL inalcanzable`);
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

probarCompararVitales();
await probarMedirVitalesSiHayPlaywright();
console.log("Benchmark: comparación pura verificada siempre; medición con Chromium real verificada si Playwright está disponible.");
