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
sesión, usa su medición de salud como línea base (código, tiempo de
respuesta, tamaño de contenido). Si no, tómala tú mismo ahora contra
`.fabrica/deploy.json` → `url_produccion`.

## Paso 2 — La ventana de vigilancia

Pregunta al usuario (RECOMENDACIÓN: 15 minutos para cambios normales, 60
para cambios de infraestructura/datos) o usa el default. Sondea a
intervalos (cada 60-90s) durante la ventana:

1. **Disponibilidad**: código de estado HTTP de `ruta_salud` (o `/`).
   4xx/5xx nuevos que no estaban en la línea base = regresión.
2. **Latencia**: tiempo de respuesta. Degradación sostenida >2x la línea
   base (no un pico aislado — la red tiene ruido) = señal real.
3. **Contenido**: si la línea base guardó un hash/tamaño del body, compara
   — una página que de repente sirve un error 200 con HTML de error es
   peor que un 500 porque nadie lo nota solo.
4. **Errores de consola** (si hay navegador disponible vía `/qa`): opcional,
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
