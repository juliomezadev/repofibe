---
name: investigar
description: |
  Debugging sistemático con Ley de Hierro: ninguna corrección sin
  investigación previa. Traza el flujo de datos, formula hipótesis, diseña la
  observación más barata que la refute. Úsala cuando haya cualquier bug, test
  que falla o comportamiento inesperado: "hay un bug", "esto falla", "¿por qué
  pasa esto?", "investiga". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /investigar — Debugging sistemático

**LEY DE HIERRO: prohibido editar código de producción antes de tener una
causa raíz demostrada con evidencia.** "Probemos cambiando esto" está vetado.

## Fase 1 — Reproduce

Sin reproducción no hay investigación. Consigue el comando/flujo mínimo que
dispara el bug y ejecútalo TÚ. Si no reproduce, junta datos (logs, versión,
entorno, timing) hasta reproducir o hasta demostrar en qué condición aparece.
Registra el comando de reproducción — será el test de regresión.

## Fase 2 — Traza hacia atrás

Desde el síntoma, camina el flujo de datos hacia atrás: ¿qué produjo este
valor? ¿qué produjo ESE? Lee el código real de cada eslabón (regla 3). El
objetivo es el punto exacto donde la realidad diverge de la expectativa.
Herramientas por orden de baratura: leer código → logs existentes → un log
temporal quirúrgico → debugger. Marca los logs temporales con `// DEBUG-TEMP`
para limpiarlos después.

## Fase 3 — Hipótesis → observación → veredicto

Formato obligatorio, por escrito, por cada iteración:

```
HIPÓTESIS: <causa concreta y falsable>
OBSERVACIÓN: <la comprobación MÁS BARATA que puede refutarla>
RESULTADO: <lo que se vio de verdad>
VEREDICTO: confirmada | refutada → siguiente hipótesis
```

Refutada no es fracaso: es medio bit de información. Confirmada exige que la
evidencia explique el 100% del síntoma — si explica el 80%, hay una segunda
causa; sigue.

## Fase 4 — Fix + regresión

Con causa raíz demostrada: corrige LA CAUSA (no el síntoma), escribe el test
de regresión con el comando de la Fase 1, verifica que falla sin el fix y
pasa con él (pega ambas salidas — regla 1). Limpia los `DEBUG-TEMP`.

**Freno de emergencia:** 3 fixes fallidos = el diagnóstico está mal. PARA,
vuelve a Fase 2 con las tres refutaciones como datos, y considera preguntar
al usuario qué cambió recientemente en el entorno.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar investigar "causa raíz: <una línea>; regresión: <test>"
node <RAIZ>/nucleo/memoria.mjs agregar error "<trampa encontrada y cómo detectarla rápido>"
```
