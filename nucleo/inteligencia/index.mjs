// index.mjs — fachada pública del núcleo de inteligencia.

export * from "./contratos.mjs";
export * from "./evidencia.mjs";
export * from "./modos.mjs";
export * from "./riesgo.mjs";
export * from "./router.mjs";

import { crearPlan, crearTarea } from "./contratos.mjs";
import { MODOS, resolverPolitica } from "./modos.mjs";
import { clasificarRiesgo } from "./riesgo.mjs";
import { enrutar } from "./router.mjs";

const ACCION_POR_INTENCION = Object.freeze({
  producto: "lectura",
  construccion: "escritura",
  debug: "escritura",
  revision: "lectura",
  qa: "prueba",
  seguridad: "lectura",
  legal: "lectura",
  release: "deploy",
  documentacion: "escritura",
  general: "lectura",
});

const PASOS_POR_INTENCION = Object.freeze({
  producto: ["Confirmar problema, usuario y alcance", "Comparar opciones y criterios de éxito", "Registrar decisión y próximos pasos"],
  construccion: ["Inspeccionar el código afectado", "Implementar el cambio mínimo", "Ejecutar pruebas y registrar evidencia"],
  debug: ["Reproducir el fallo", "Aislar la causa raíz", "Aplicar la corrección y ejecutar regresión"],
  revision: ["Inspeccionar el cambio y sus dependencias", "Buscar riesgos y casos borde", "Registrar hallazgos con evidencia"],
  qa: ["Definir escenarios críticos", "Ejecutar pruebas funcionales y de regresión", "Registrar resultados reproducibles"],
  seguridad: ["Delimitar activos y amenazas", "Inspeccionar controles y superficies de ataque", "Registrar hallazgos y mitigaciones"],
  legal: ["Separar hechos de supuestos", "Verificar jurisdicción y fuentes aplicables", "Registrar riesgos y necesidad de asesoría"],
  release: ["Revisar cambios y criterios de salida", "Verificar pruebas y artefactos", "Preparar publicación con aprobación"],
  documentacion: ["Inspeccionar el comportamiento actual", "Redactar la guía para el usuario objetivo", "Verificar ejemplos y enlaces"],
  general: ["Aclarar objetivo y alcance", "Ejecutar la acción propuesta", "Verificar el resultado y registrar evidencia"],
});

function gatesPara({ ruta, politica, riesgo }) {
  const gates = [{ id: "scope", tipo: "inspeccion", descripcion: "Objetivo y alcance confirmados", requerido: true }];
  if (["debug", "qa", "construccion", "revision"].includes(ruta.intencion)) {
    gates.push({ id: "tests", tipo: "prueba", descripcion: "Verificación ejecutada y registrada", requerido: true });
  }
  if (ruta.intencion === "legal") gates.push({ id: "sources", tipo: "revision", descripcion: "Fuentes y jurisdicción verificadas", requerido: true });
  if (ruta.intencion === "release") gates.push({ id: "release-check", tipo: "revision", descripcion: "Criterios de salida revisados", requerido: true });
  if (politica.requiereAprobacion || riesgo.nivel === "alto") {
    gates.push({ id: "approval", tipo: "aprobacion", descripcion: "Aprobación explícita antes de ejecutar", requerido: true });
  }
  return gates;
}

export function analizarTarea(input = {}) {
  const entrada = typeof input === "string" ? { objetivo: input } : input;
  const tarea = crearTarea({ ...entrada, modo: entrada.modo ?? MODOS.EQUILIBRADO });
  const ruta = enrutar(tarea);
  const riesgo = clasificarRiesgo(tarea);
  const accion = ACCION_POR_INTENCION[ruta.intencion] ?? "lectura";
  const politica = resolverPolitica({ modo: tarea.modo, accion, nivelRiesgo: riesgo.nivel });
  const plan = crearPlan({
    tarea,
    intencion: ruta.intencion,
    riesgo,
    modo: tarea.modo,
    accion,
    pasos: PASOS_POR_INTENCION[ruta.intencion] ?? PASOS_POR_INTENCION.general,
    gates: gatesPara({ ruta, politica, riesgo }),
    criteriosFinalizacion: ["Cada paso tiene estado", "Cada gate requerido tiene evidencia válida", "El modo y la política fueron respetados"],
  });
  return { version: 1, tarea, ruta, riesgo, politica, plan };
}

