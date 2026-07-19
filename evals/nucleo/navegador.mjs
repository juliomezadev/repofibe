#!/usr/bin/env node
// Pruebas funcionales de nucleo/navegador.mjs — el sistema de refs propio
// (parsearRefs) se prueba siempre, sin dependencias. La integración real
// con Chromium (ejecutarScript) se prueba SOLO si Playwright está
// instalado en este proyecto — repofibe sigue siendo cero-deps, así que un
// checkout limpio no lo tiene, y eso no debe hacer fallar la suite
// principal; se omite con evidencia clara, no en silencio.

import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { parsearRefs, ejecutarScript } from "../../nucleo/navegador.mjs";

function probarParsearRefs() {
  // Caso base: roles y nombres distintos.
  const s1 = '- heading "Título" [level=1]\n- button "Guardar"\n- textbox "nombre"';
  const r1 = parsearRefs(s1);
  assert.equal(Object.keys(r1).length, 3);
  assert.deepEqual(r1.e1, { role: "heading", name: "Título", indice: 0 });
  assert.deepEqual(r1.e2, { role: "button", name: "Guardar", indice: 0 });
  assert.deepEqual(r1.e3, { role: "textbox", name: "nombre", indice: 0 });

  // Caso real del spike: dos botones idénticos deben desambiguarse por índice.
  const s2 = '- button "Guardar"\n- button "Guardar"\n- button "Guardar"';
  const r2 = parsearRefs(s2);
  assert.equal(r2.e1.indice, 0);
  assert.equal(r2.e2.indice, 1);
  assert.equal(r2.e3.indice, 2);
  assert.equal(r2.e1.name, r2.e3.name, "mismo nombre, distinto índice");

  // Líneas sin el formato `- role "nombre"` se ignoran sin romper el conteo.
  const s3 = '- heading "Solo" [level=1]\n  - /url: "https://ejemplo.com"\n- link "Otro"';
  const r3 = parsearRefs(s3);
  assert.equal(Object.keys(r3).length, 2, "la línea de metadata /url no debe contar como elemento");

  console.log("ok: parsearRefs (roles distintos, duplicados desambiguados por índice, líneas de metadata ignoradas)");
}

async function probarEjecutarScriptSiHayPlaywright() {
  let disponible = true;
  try { await import("playwright"); } catch { disponible = false; }
  if (!disponible) {
    console.log("omitido: playwright no está instalado en este proyecto (repofibe es cero-deps) — instala con `npm install playwright && npx playwright install chromium` para correr esta prueba de integración real");
    return;
  }

  const servidor = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><body>
      <h1>Prueba repofibe</h1>
      <button>Guardar</button>
      <button>Guardar</button>
      <input type="text" placeholder="nombre" />
    </body></html>`);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${servidor.address().port}/`;

  try {
    const resultados = await ejecutarScript([
      { accion: "navegar", url },
      { accion: "snapshot" },
      { accion: "click", ref: "e3" }, // segundo botón "Guardar" (e1=heading, e2=button#0, e3=button#1)
      { accion: "escribir", ref: "e4", texto: "hola repofibe" },
      { accion: "texto", ref: "e4" },
      { accion: "screenshot" },
    ]);

    assert.equal(resultados.length, 6, `esperaba 6 resultados, hubo ${resultados.length}`);
    assert.ok(resultados.every((r) => r.ok), `alguna acción falló: ${JSON.stringify(resultados.filter((r) => !r.ok))}`);
    assert.equal(resultados[0].url, url);
    assert.equal(resultados[1].refs, 4, "snapshot debía encontrar 4 elementos (heading + 2 botones + input)");
    assert.equal(resultados[4].valor, "hola repofibe", "el texto leído debía ser el que se escribió con 'escribir'");
    assert.ok(resultados[5].bytes > 0, "el screenshot debía tener contenido");

    // Una acción fallida (ref inexistente) debe detenerse con error, no explotar el proceso.
    const conError = await ejecutarScript([{ accion: "navegar", url }, { accion: "click", ref: "e999" }]);
    assert.equal(conError.length, 2);
    assert.equal(conError[1].ok, false);
    assert.match(conError[1].error, /ref desconocido/);

    console.log("ok: ejecutarScript end-to-end con Chromium real (navegar, snapshot, click en el 2º de 2 botones idénticos, escribir, leer, screenshot, y fallo controlado con ref inexistente)");
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

probarParsearRefs();
await probarEjecutarScriptSiHayPlaywright();
console.log("Navegador: sistema de refs verificado siempre; integración con Chromium verificada si Playwright está disponible.");
