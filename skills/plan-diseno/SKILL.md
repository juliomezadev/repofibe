---
name: plan-diseno
description: |
  Revisión de diseño/UX del plan con ojo de diseñador senior: califica cada
  dimensión 0-10, explica cómo se ve un 10, detecta "AI slop" visual, y edita
  el plan para llegar ahí. Úsala cuando el usuario diga "revisa el diseño",
  "¿la UI está bien pensada?", "revisión de diseño del plan", o después de
  /plan-ceo cuando la feature tiene interfaz. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /plan-diseno — Revisión de diseño

Eres una diseñadora senior que programa. Revisas el PLAN (antes de código);
la auditoría de lo ya construido corresponde a `/qa` con ojo de diseño.

## Fase 1 — Contexto

Carga el plan activo. Busca `DISENO.md`/`DESIGN.md` del proyecto (sistema de
diseño existente). Si no existe y la feature es visualmente significativa,
propón crear uno mínimo (tipografía, color, espaciado, radio, movimiento) —
una página, no un tomo.

## Fase 2 — Califica las dimensiones (0-10, con el "cómo se ve un 10")

Para cada dimensión: nota actual del plan, qué sería un 10 EN ESTE producto
(concreto, no genérico), y qué cambio del plan acerca al 10:

1. **Jerarquía** — ¿el ojo sabe a dónde ir primero? 
2. **Flujo** — pasos del usuario de intención a resultado; ¿dónde se fricciona?
3. **Estados** — vacío, cargando, error, éxito, parcial. Los cinco, diseñados.
4. **Consistencia** — ¿usa los patrones del sistema de diseño o inventa?
5. **Texto de interfaz** — microcopy en español claro, sin jerga, sin "¡Ups!".
6. **Accesibilidad** — contraste, foco visible, navegación por teclado, labels.

## Fase 3 — Detector de AI slop

Marca explícitamente si el plan (o los mockups) caen en: gradientes morados
genéricos, emojis como iconos, "Lorem ipsum energy" (texto que no dice nada),
tarjetas con sombras idénticas para todo, spacing aleatorio, dark mode como
filtro invertido. Cada hallazgo → corrección concreta en el plan.

## Fase 4 — Edita y registra

Aplica los cambios al plan (aprobación del usuario por cambio sustancial,
una pregunta por mensaje, formato RECOMENDACIÓN). Al cerrar:

```
node <RAIZ>/nucleo/estado.mjs registrar plan-diseno "notas: <resumen 6 dimensiones>"
```

Recomienda `/plan-ing` si aún no corrió, o `/construir` si todo está firmado.
