---
name: canario
description: |
  Monitoreo post-deploy: vigila producción durante una ventana después de
  desplegar y detecta regresiones reales (errores HTTP, latencia degradada,
  contenido roto) contra una línea base tomada antes del deploy. Úsala cuando
  el usuario diga "vigila el deploy", "monitorea producción", "¿sigue bien
  después del deploy?", o después de que /desplegar confirma salud inicial.
  (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /canario — Vigilar después de desplegar

Un deploy "sano" al minuto 1 puede degradarse al minuto 10 (memory leak,
conexión que se agota, caché frío). El canario es la diferencia entre
enterarte por un usuario enojado o por ti mismo.

## Paso 1 — Línea base

Antes de vigilar, necesitas con qué comparar. Si `/desplegar` corrió en esta
sesión, ya existe `.fabrica/salud-base.json` (código real, no prosa). Si no:

```
node <RAIZ>/nucleo/salud.mjs base <url_produccion> [ruta_salud]
```

## Paso 2 — La ventana de vigilancia

Pregunta al usuario (RECOMENDACIÓN: 15 minutos para cambios normales, 60
para cambios de infraestructura/datos) o usa el default. Sondea a
intervalos (cada 60-90s) durante la ventana:

```
node <RAIZ>/nucleo/salud.mjs comparar <url_produccion> [ruta_salud]
```

Código de salida 0 = estable; 1 = regresión, con los motivos concretos
(código HTTP degradado, o latencia >2x sostenida con salto absoluto real —
no un pico aislado de red). Un pico aislado en un solo sondeo no es
regresión: exige verlo repetirse en 2+ sondeos consecutivos antes de actuar.

**Límite honesto sobre "contenido":** `salud.mjs` reporta si el hash del
contenido cambió (`contenidoCambio`), pero eso es solo informativo — un
deploy legítimo cambia el contenido todo el tiempo, y sin inspección
semántica del body no hay forma confiable de distinguir "contenido nuevo
válido" de "página de error servida con 200". No lo trates como señal de
regresión por sí solo; si sospechas ese caso específico, verifícalo
manualmente abriendo la URL o con `/qa`.

**Errores de consola** (si hay navegador disponible vía `/qa`): opcional,
solo si el proyecto es web y el usuario lo pide — es más caro.

## Paso 3 — Ante una regresión

PARA de vigilar en silencio: reporta inmediatamente con evidencia (qué
cambió respecto a la línea base, desde cuándo). No decidas rollback tú
solo — es una acción irreversible en sistema compartido. Presenta el hecho
y una recomendación (RECOMENDACIÓN: rollback si es severo y sostenido;
seguir vigilando si es un pico aislado) y espera al usuario.

## Paso 4 — Cierre de ventana

Si la ventana termina sin regresión: reporta las métricas (disponibilidad
%, latencia p50 vs línea base) y declara el deploy estable.

```
node <RAIZ>/nucleo/estado.mjs registrar canario "<n> min vigilados: <estable|regresión detectada>"
```

Si detectaste una regresión real, guárdala para que el próximo `/desplegar`
la prevea: `memoria.mjs agregar aprendizaje "<qué se degradó y bajo qué condición>"`.
