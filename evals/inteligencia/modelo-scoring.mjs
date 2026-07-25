#!/usr/bin/env node
// modelo-scoring.mjs — Modelo de puntuación para comparar dos sistemas sobre
// un catálogo de tareas de ingeniería. NO es un benchmark: no ejecuta nada,
// no mide nada, no compara nada. Es la fórmula y el catálogo, nada más.
//
// ── RETRACTACIÓN (2026-07-25) ───────────────────────────────────────────────
// Este archivo reemplaza a `benchmark-gstack.mjs`, que afirmaba publicar
// "mediciones empíricas" de repofibe (94.8/100) contra gstack (53.4/100) bajo
// "evaluación doble ciega". Eso era falso. El arnés anterior:
//
//   - nunca instaló ni ejecutó gstack (cero subprocesos, cero llamadas),
//   - nunca importó `juez.mjs` (no hubo evaluación doble ciega ni de ningún tipo),
//   - fijaba `eficacia: true` para repofibe por constante,
//   - fijaba `eficacia: tarea.id % 4 !== 0` para gstack (fallar 5 de 20, por aritmética),
//   - generaba RSS, tokens y latencia con `Math.random()` en rangos elegidos
//     para que repofibe ganara.
//
// Además corría dentro de `evals/validar.mjs`, así que la suite reportaba
// "Todo verde" en parte por certificar esa ficción: generar números aleatorios
// nunca falla.
//
// Se conserva lo que sí era trabajo real y verificable: el catálogo de 20
// tareas (un artefacto de diseño legítimo) y `calcularScore` (matemática pura,
// determinista y ahora sí probada con vectores conocidos). Se elimina todo lo
// que producía cifras sin medir.
//
// Para volver a afirmar superioridad hace falta lo que nunca hubo: ejecutar
// ambos sistemas de verdad, con mediciones instrumentadas, y un juez que no
// sea juez y parte. Ver `docs/BENCHMARK-GSTACK.md`.

import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// ── Catálogo de tareas (diseño, no resultados) ──────────────────────────────
export const CATALOGO_TAREAS = [
  // Seguridad
  { id: 1, dim: "Seguridad", nombre: "Auditoría de Inyección Real (SQL/NoSQL)" },
  { id: 2, dim: "Seguridad", nombre: "Modelado STRIDE con Gate de Confianza (0 Falsos Positivos)" },
  { id: 3, dim: "Seguridad", nombre: "Caza de Fugas de Secretos en Historial Git" },
  { id: 4, dim: "Seguridad", nombre: "Bypass de Autorización (IDOR/BOLA)" },
  // QA / Navegación
  { id: 5, dim: "QA", nombre: "Autenticación y Persistencia de Sesión (storageState)" },
  { id: 6, dim: "QA", nombre: "Scraping Estructurado de SPA Paginada" },
  { id: 7, dim: "QA", nombre: "Captura de Regresiones en Red/Consola (HAR)" },
  { id: 8, dim: "QA", nombre: "Benchmark de Core Web Vitals (CWV)" },
  // Arquitectura / Refactor
  { id: 9, dim: "Arquitectura", nombre: "Desacoplamiento de Monolito UI" },
  { id: 10, dim: "Arquitectura", nombre: "Resolución de Dependencias Circulares" },
  { id: 11, dim: "Arquitectura", nombre: "Análisis de Impacto en Grafo (Hubs)" },
  { id: 12, dim: "Arquitectura", nombre: "Selección de Pruebas Afectadas (Smart Testing)" },
  // Legal
  { id: 13, dim: "Legal", nombre: "Política de Tratamiento de Datos (Ley 1581/2012)" },
  { id: 14, dim: "Legal", nombre: "Términos de Servicio (Ley 1480/2011)" },
  { id: 15, dim: "Legal", nombre: "Derechos Patrimoniales de Software (Ley 23/1982)" },
  { id: 16, dim: "Legal", nombre: "Viabilidad Legal de Scraping (Competencia Desleal)" },
  // UX / Diseño
  { id: 17, dim: "Diseño", nombre: "Derivación de Tokens de Marca" },
  { id: 18, dim: "Diseño", nombre: "Eliminación de AI Slop Visual" },
  { id: 19, dim: "Diseño", nombre: "Auditoría Heurística de Nielsen" },
  { id: 20, dim: "Diseño", nombre: "Conversión Mobile-First de Alta Densidad" },
];

// ── Fórmula de puntuación (0 a 100), determinista ───────────────────────────
// Entrada: mediciones REALES de una corrida. Esta función no las inventa;
// si le pasas números inventados, devuelve una puntuación inventada. La
// honestidad vive en quien la alimenta, por eso `puntuarComparacion` exige
// procedencia explícita.
export function calcularScore({ eficacia, peakRssMb, tokensReales, latenciaMs }) {
  const SE = 40 * (eficacia ? 1 : 0);              // Eficacia booleana (40%)

  const R_BASE = 100, R_MAX = 600;                  // Peak RSS (20%)
  const SR = 20 * Math.max(0, 1 - Math.max(0, peakRssMb - R_BASE) / (R_MAX - R_BASE));

  const T_MAX = 15000;                              // Tokens reales (20%)
  const ST = 20 * Math.max(0, 1 - Math.min(tokensReales, T_MAX) / T_MAX);

  const L_IDEAL = 2000, L_MAX = 30000;              // Latencia (20%), log-amortiguada
  let SL = 20;
  if (latenciaMs > L_IDEAL) {
    const ratio = Math.log10(latenciaMs / L_IDEAL) / Math.log10(L_MAX / L_IDEAL);
    SL = 20 * Math.max(0, 1 - ratio);
  }

  return {
    scoreTotal: Math.round((SE + SR + ST + SL) * 10) / 10,
    desglose: { SE, SR: Math.round(SR * 10) / 10, ST: Math.round(ST * 10) / 10, SL: Math.round(SL * 10) / 10 },
  };
}

/**
 * Puntúa una comparación a partir de mediciones REALES ya tomadas.
 *
 * Rechaza explícitamente ser llamada sin mediciones. Es el candado que
 * distingue esta función del arnés retractado: allí las "mediciones" se
 * generaban solas; aquí, si no hubo corrida, no hay resultado.
 *
 * @param {Array<{tareaId:number, sistema:string, eficacia:boolean,
 *   peakRssMb:number, tokensReales:number, latenciaMs:number, procedencia:string}>} mediciones
 */
export function puntuarComparacion(mediciones) {
  if (!Array.isArray(mediciones) || mediciones.length === 0) {
    throw new Error(
      "puntuarComparacion requiere mediciones reales de una corrida ejecutada. " +
      "No hay valores por defecto ni simulación: sin medición no hay puntuación."
    );
  }
  for (const m of mediciones) {
    for (const campo of ["tareaId", "sistema", "eficacia", "peakRssMb", "tokensReales", "latenciaMs", "procedencia"]) {
      if (m[campo] === undefined || m[campo] === null) {
        throw new Error(`medición incompleta: falta "${campo}". Toda medición debe declarar su procedencia.`);
      }
    }
    if (typeof m.procedencia !== "string" || m.procedencia.trim() === "") {
      throw new Error('la "procedencia" debe decir cómo se obtuvo la medición (instrumento, fecha, comando).');
    }
  }
  return mediciones.map((m) => ({ ...m, ...calcularScore(m) }));
}

// ── Autoprueba: vectores conocidos, no cifras generadas ─────────────────────
function autoprueba() {
  // Caso perfecto: eficaz, RSS en la base, cero tokens, latencia ideal.
  assert.equal(calcularScore({ eficacia: true, peakRssMb: 100, tokensReales: 0, latenciaMs: 2000 }).scoreTotal, 100);

  // Caso nulo: ineficaz y en todos los techos.
  assert.equal(calcularScore({ eficacia: false, peakRssMb: 600, tokensReales: 15000, latenciaMs: 30000 }).scoreTotal, 0);

  // Los tres ejes saturan (no dan negativo) cuando se pasan del techo.
  assert.equal(calcularScore({ eficacia: false, peakRssMb: 5000, tokensReales: 999999, latenciaMs: 900000 }).scoreTotal, 0);

  // La eficacia sola vale exactamente 40 puntos.
  assert.equal(calcularScore({ eficacia: true, peakRssMb: 600, tokensReales: 15000, latenciaMs: 30000 }).scoreTotal, 40);

  // RSS a mitad de rango vale la mitad de su peso.
  assert.equal(calcularScore({ eficacia: false, peakRssMb: 350, tokensReales: 15000, latenciaMs: 30000 }).desglose.SR, 10);

  // Determinismo: la misma entrada da exactamente el mismo resultado.
  const entrada = { eficacia: true, peakRssMb: 222, tokensReales: 3333, latenciaMs: 4444 };
  assert.deepEqual(calcularScore(entrada), calcularScore(entrada));

  // El candado: sin mediciones, no hay puntuación.
  assert.throws(() => puntuarComparacion([]), /requiere mediciones reales/);
  assert.throws(
    () => puntuarComparacion([{ tareaId: 1, sistema: "x", eficacia: true, peakRssMb: 1, tokensReales: 1, latenciaMs: 1 }]),
    /falta "procedencia"/
  );

  // Con mediciones bien formadas sí puntúa.
  const puntuado = puntuarComparacion([
    { tareaId: 1, sistema: "repofibe", eficacia: true, peakRssMb: 100, tokensReales: 0, latenciaMs: 2000, procedencia: "autoprueba (vector fijo, no es una corrida real)" },
  ]);
  assert.equal(puntuado[0].scoreTotal, 100);

  assert.equal(CATALOGO_TAREAS.length, 20);
  assert.equal(new Set(CATALOGO_TAREAS.map((t) => t.id)).size, 20, "ids del catálogo duplicados");

  console.log("ok: modelo de scoring verificado con 10 vectores conocidos (no hay comparación ejecutada — ver docs/BENCHMARK-GSTACK.md)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  autoprueba();
}
