# Comparación repofibe vs gstack — RETRACTADO

> **No existe ninguna comparación medida entre repofibe y gstack.**
>
> Las versiones anteriores de este documento publicaban "repofibe 94.8 / 100
> vs gstack 53.4 / 100" como *mediciones empíricas* bajo *evaluación doble
> ciega*. Esas cifras eran inventadas. Se retractan en su totalidad el
> 2026-07-25.

## Qué se afirmaba y qué había en realidad

El documento decía apoyarse en `evals/inteligencia/benchmark-gstack.mjs`,
descrito como "arnés determinista" con "telemetría de Peak RSS y tokens" y
"evaluación doble ciega con `nucleo/juez.mjs`". El código real de ese arnés,
en sus 118 líneas, hacía esto:

```js
// Lo que de verdad contenía el "arnés empírico":
const repofibeMetrics = {
  eficacia: true,                                        // constante: siempre gana
  peakRssMb: 145 + Math.floor(Math.random() * 20),       // número aleatorio
  tokensReales: 2100 + Math.floor(Math.random() * 400),  // número aleatorio
  latenciaMs: 1200 + Math.floor(Math.random() * 500),    // número aleatorio
};
const gstackMetrics = {
  eficacia: tarea.id % 4 !== 0,                          // pierde 5 de 20, por aritmética
  peakRssMb: 480 + Math.floor(Math.random() * 80),       // rango elegido para ser peor
  tokensReales: 8500 + Math.floor(Math.random() * 1500),
  latenciaMs: 4500 + Math.floor(Math.random() * 2000),
};
```

Punto por punto:

| Se afirmaba | Realidad |
|---|---|
| Se ejecutaron 20 tareas contra gstack | gstack nunca se instaló ni se invocó. Cero subprocesos, cero llamadas |
| Evaluación doble ciega con `juez.mjs` | `juez.mjs` ni siquiera se importaba. No hubo evaluación de ningún tipo |
| Peak RSS medido con worker cada 50 ms | No hay worker ni muestreo. Es `Math.random()` |
| Tokens reales devueltos por la API | No hay llamada a ninguna API |
| Eficacia verificada con evidencia | `true` fijo para repofibe; `id % 4 !== 0` para gstack |
| Tabla con 40 scores por tarea | Escrita a mano — el arnés usaba aleatorios, no podía producirlas |
| Ventaja por "Daemon IPC, Chromium reutilizado" | Ese daemon **no existe**. Está explícitamente descartado en `.fabrica/problemas/navegador-propio.md` (decisión 3: v1 es script por invocación, no daemon) |

Agravante: el arnés corría dentro de `evals/validar.mjs`, así que la suite
reportaba "Todo verde" certificando también esto. Generar números aleatorios
nunca falla, de modo que esa prueba no podía ponerse en rojo jamás.

## Qué se conservó

`evals/inteligencia/modelo-scoring.mjs` conserva lo que sí era trabajo real:

- **El catálogo de 20 tareas** en 5 dimensiones. Es un artefacto de diseño
  legítimo: define qué valdría la pena medir.
- **La fórmula de puntuación** (`calcularScore`): eficacia 40%, Peak RSS 20%,
  tokens 20%, latencia 20% con amortiguación logarítmica. Es matemática pura
  y determinista, y ahora está probada con vectores conocidos en vez de
  ejercitada con aleatorios.
- **Un candado nuevo** (`puntuarComparacion`): rechaza producir puntuación sin
  mediciones que declaren su procedencia. Sin corrida no hay resultado.

Se eliminó todo lo que producía cifras sin medir.

## Qué haría falta para publicar una comparación defendible

Esto es el trabajo pendiente real, no una promesa:

1. **Ejecutar ambos sistemas.** Instalar gstack, correr las mismas 20 tareas
   en las dos herramientas, guardando transcripciones completas.
2. **Instrumentar de verdad.** Peak RSS con muestreo real del árbol de
   procesos; tokens leídos del `usage` que devuelve la API; latencia con
   reloj, no con estimación.
3. **Un juez que no sea juez y parte.** `nucleo/juez.mjs` corriendo sobre
   respuestas anonimizadas (sin marcas de formato que delaten el sistema),
   con la rúbrica publicada **antes** de ver los resultados.
4. **Publicar la evidencia cruda**, no solo el promedio: transcripciones,
   mediciones por tarea, y los casos donde repofibe pierde. Un benchmark sin
   derrotas es un folleto.
5. **Declarar el conflicto de interés.** Aunque los pasos 1-4 se cumplan,
   sigue siendo el examinado diseñando su propio examen. Eso se dice, no se
   omite.

Hasta que existan los cinco puntos, la respuesta honesta a "¿es repofibe
mejor que gstack?" es: **no se ha medido.**

## Lo que sí está demostrado de repofibe

No hace falta un benchmark inventado para mostrar trabajo real. Lo verificable
hoy, con evals que ejecutan de verdad y se pueden correr en cualquier máquina:

- Los guardias deterministas, el estado de sprint y la memoria funcionan y
  están cubiertos por `evals/validar.mjs` (tier 1, gratis, sin red).
- Varios bugs reales fueron encontrados por las propias evals antes de
  publicar, caso por caso, documentados en `docs/PLAN-SUPERACION.md`
  (`pruebas.mjs`, `secretos.mjs`, `navegador.mjs`).
- La corrupción de memoria del merge driver (`sync.mjs`) se detectó en
  auditoría y se corrigió con eval que la fija en rojo (v0.5.1).

Eso es evidencia. Lo otro era decoración.

## Bitácora

- **2026-07-25**: retractación completa. Detectado al ejecutar la Fase 0 del
  plan `docs/fabrica/2026-07-25-plan-lazo-cerrado.md`, que originalmente
  solo pretendía añadir la aclaración "benchmark auto-administrado". Al
  abrir el arnés para citarlo con precisión se encontró que no medía nada.
  Se eliminó `benchmark-gstack.mjs`, se conservó el modelo de scoring en
  `modelo-scoring.mjs`, y se añadió a `evals/validar.mjs` un guardia que
  falla si vuelve a aparecer `Math.random()` en `evals/` — una suite de
  medición que usa aleatoriedad está fabricando o es no determinista, y
  ninguna de las dos es aceptable.
