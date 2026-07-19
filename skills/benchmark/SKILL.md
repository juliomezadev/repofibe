---
name: benchmark
description: |
  Core Web Vitals reales (LCP, CLS, TTFB) sobre Chromium real, con
  benchmark.mjs — línea base antes de un cambio, comparación después,
  regresión reportada con motivos concretos. Úsala cuando el usuario diga
  "mide el rendimiento", "¿esto empeoró la velocidad?", "benchmark de la
  página", o antes/después de un cambio grande en el frontend. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /benchmark — Rendimiento real, no estimado

Mide sobre Chromium real (LCP, CLS, TTFB, recursos, bytes transferidos), no
adivina desde el código. Requiere `navegador.mjs`/`benchmark.mjs`
(Playwright); si no está instalado, el propio comando lo dice.

## Antes de un cambio: línea base

```
node <RAIZ>/nucleo/benchmark.mjs base <url>
```

Guarda la medición en `.fabrica/benchmark-base.json`. Tómala en un momento
representativo (no con la máquina saturada de otras tareas — el ruido de
CPU local afecta la medición más que cualquier cambio real de código).

## Después del cambio: comparar

```
node <RAIZ>/nucleo/benchmark.mjs comparar <url>
```

Código de salida 0 = estable; 1 = regresión, con motivos concretos (LCP o
TTFB >1.25x con salto absoluto real, o CLS que cruza 0.1 — el umbral de
"necesita mejora" de Google). `bytesTransferidos` es informativo, nunca
decide el veredicto por sí solo: un asset que creció puede ser una imagen
mejor, no una regresión.

## Interpreta con criterio

- **Una sola medición tiene ruido.** Si el veredicto es "regresión" pero el
  margen es ajustado, corre `medir` 2-3 veces más antes de concluir.
- **LCP** es el elemento más grande visible al cargar — casi siempre una
  imagen o el bloque de texto principal. Si empeoró, mira qué cambió en esa
  parte de la página primero.
- **CLS** mide saltos de layout — casi siempre imágenes/anuncios sin
  dimensiones reservadas, o fuentes que cargan tarde y reflowan el texto.
- Si el usuario pide comparar dos ramas/versiones: toma la base en una
  rama, cambia a la otra, compara — no hay "modo automático" de checkout
  en v1, es responsabilidad de quien invoca la skill.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar benchmark "<url>: <estable|regresión> (LCP <n>ms, CLS <n>)"
```

Si encontraste una regresión real, guárdala para que `/revisar` la tenga
presente en cambios similares: `memoria.mjs agregar aprendizaje "<qué cambio causó qué regresión>"`.
