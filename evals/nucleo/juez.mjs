#!/usr/bin/env node
// evals/nucleo/juez.mjs — eval funcional de juez.mjs (arquitectura, no juicio de LLM)

import { strictEqual, ok } from "node:assert";
import { detectarProveedor, listarProveedores, rubrica, PROVEEDORES } from "../../nucleo/juez.mjs";

function proveedorDisponible() {
  const p = detectarProveedor();
  if (p) {
    ok(PROVEEDORES[p], `detectarProveedor debía retornar un proveedor conocido: ${p}`);
    ok(listarProveedores().includes(p), `listarProveedores debía incluir ${p}`);
  } else {
    ok(listarProveedores().length === 0, "sin proveedores, listar debía retornar []");
  }
}

function rubricaExistente() {
  const skillsConRubrica = ["qa", "design-review", "revisar", "plan-diseno", "construir"];
  for (const skill of skillsConRubrica) {
    const criterios = rubrica(skill);
    ok(criterios.length === 5, `rubrica(${skill}) debía tener 5 criterios, tiene ${criterios.length}`);
    criterios.forEach((c) => ok(c.length > 10, `criterio debía ser sustancial: "${c}"`));
  }
  const defaultRubrica = rubrica("skill-que-no-existe");
  ok(defaultRubrica.length === 5, "rubrica default debía tener 5 criterios");
}

function formatoRubricaConsistente() {
  const todas = ["qa", "design-review", "revisar", "plan-diseno", "construir", "default"];
  const counts = todas.map((s) => rubrica(s).length);
  ok(counts.every((c) => c === 5), `todas las rubricas debían tener 5 criterios: ${counts.join(",")}`);
  for (const skill of todas) {
    const criterios = rubrica(skill);
    const unicos = new Set(criterios);
    ok(unicos.size === criterios.length, `rubrica(${skill}) no debía tener criterios duplicados`);
  }
}

proveedorDisponible();
console.log("ok: detectarProveedor y listarProveedores consistentes");
rubricaExistente();
console.log("ok: rubricas específicas para 5 skills + default, cada una con 5 criterios sustanciales");
formatoRubricaConsistente();
console.log("ok: todas las rubricas tienen exactamente 5 criterios, sin duplicados");

const proveedor = detectarProveedor();
if (proveedor) {
  console.log(`integración: proveedor ${proveedor} disponible — job manual con costo, omitido de CI por diseño`);
}

console.log("Juez: arquitectura verificada (detección dinámica, rubricas estructuradas, job manual); integración real es job manual con costo, no CI.");