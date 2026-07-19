---
name: autoplan
description: |
  Pipeline de revisiones automático: ejecuta /plan-ceo → /plan-diseno (si hay
  UI) → /plan-ing en secuencia, tomando las decisiones obvias con seis
  principios codificados y preguntando al usuario SOLO las decisiones de
  gusto. Úsala cuando el usuario diga "autoplan", "revisa el plan completo",
  "prepara el plan sin preguntarme todo", "plan con todas las revisiones".
  (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /autoplan — Pipeline de revisiones

Un comando, un plan completamente revisado. Ejecutas las TRES revisiones en
secuencia sobre el mismo documento, pero en modo automático: las decisiones
con respuesta objetiva se toman solas (y se registran); solo las decisiones
de gusto llegan al usuario, agrupadas.

## Fase 0 — Entrada

Plan activo (`estado.mjs ver` → PLAN), el `docs/fabrica/*-diseno.md` más
reciente, o la descripción que dé el usuario (en ese caso, escribe primero un
borrador de diseño de una página). Detecta si la feature tiene UI: eso decide
si `/plan-diseno` entra al pipeline. Anuncia el pipeline elegido en una línea.

## Los seis principios de auto-decisión

Ante cada decisión que las revisiones normalmente preguntarían:

1. **Completitud sobre atajo.** Entre la versión completa y la del 90%, se
   elige la completa (hervir el lago) — sin preguntar.
2. **Cuña sobre océano.** Entre ambición y foco, la cuña más angosta que
   entrega valor real mañana — sin preguntar.
3. **Convención del proyecto sobre novedad.** Si el código ya resuelve algo
   de una forma, se sigue esa forma — sin preguntar.
4. **Reversible se decide solo; irreversible se pregunta.** Renombrar una
   función interna: solo. Esquema de datos público, API, borrado: pregunta.
5. **Datos sobre opinión.** Si leer el código o correr un comando responde la
   duda, se verifica en vez de preguntar (regla 3 del protocolo).
6. **El gusto es del usuario.** Estética, tono del texto, nombres visibles al
   público, trade-offs de producto sin respuesta objetiva: SIEMPRE al usuario.

Cada auto-decisión queda escrita en el plan con la marca
`<!-- autoplan: principio N — <decisión en una línea> -->`. Auditable, no invisible.

## Ejecución

1. **`/plan-ceo`** en modo automático: elige el modo de alcance con los
   principios 1-2, reta las premisas contra el código real (principio 5) y
   edita el plan. Acumula las decisiones de gusto en una lista, NO preguntes aún.
2. **`/plan-diseno`** (solo si hay UI): califica las seis dimensiones, aplica
   correcciones objetivas (estados faltantes, accesibilidad), acumula el gusto
   (paleta, densidad, tono) en la lista.
3. **`/plan-ing`**: las seis secciones técnicas completas. Aquí casi todo es
   objetivo (principio 5); lo irreversible (principio 4) va a la lista.
4. **Lote de gusto:** presenta TODAS las decisiones acumuladas de una vez,
   cada una con formato RECOMENDACIÓN. Aplica las respuestas al plan.
5. **Veredicto final** de `/plan-ing`: FIRMADO o DEVUELTO con lista numerada.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs etapa construir   # solo si FIRMADO
node <RAIZ>/nucleo/estado.mjs registrar autoplan "<FIRMADO|DEVUELTO>: <n> auto-decisiones, <n> de gusto"
node <RAIZ>/nucleo/memoria.mjs agregar decision "<la decisión de gusto más significativa del lote>"
```

Cierra recomendando `/construir` (si FIRMADO). El usuario siempre puede
pedir la versión interactiva ejecutando las revisiones una a una.
