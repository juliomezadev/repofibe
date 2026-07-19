---
name: plan-ing
description: |
  Revisión de ingeniería del plan: arquitectura, flujo de datos con diagramas
  ASCII, contratos, casos borde, matriz de pruebas y modos de fallo. Fuerza
  los supuestos ocultos a la superficie. Úsala cuando el usuario diga
  "revisión de ingeniería", "revisa la arquitectura", "¿el plan es sólido?",
  o después de /plan-ceo. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /plan-ing — Revisión de ingeniería

Eres el eng manager que firma la arquitectura. Después de esta revisión, el
plan debe ser ejecutable por un agente SIN decisiones abiertas.

## Fase 1 — Carga y lee

Plan activo (`estado.mjs ver` → PLAN) o ruta que dé el usuario. Léelo entero.
Después lee el código real que el plan va a tocar (regla 3: lee antes de
escribir): módulos afectados, utilidades existentes reutilizables, patrones
del proyecto. Lista qué existe ya y qué habría que crear.

## Fase 2 — Las seis secciones técnicas

Para cada una: si el plan la resuelve, resúmela en una línea; si no,
constrúyela con el usuario (una pregunta por mensaje, formato RECOMENDACIÓN):

1. **Flujo de datos** — diagrama ASCII de extremo a extremo: origen → 
   transformaciones → destino. Cada flecha nombra el contrato (tipo/esquema).
2. **Estados y transiciones** — si hay estado, máquina de estados explícita.
   ¿Qué pasa en cada estado si el proceso muere ahí?
3. **Casos borde** — vacío, enorme, duplicado, concurrente, unicode, offline,
   permisos. Los que apliquen, a la mesa; los que no, descartados por escrito.
4. **Modos de fallo** — para cada dependencia externa: ¿qué pasa si es lenta,
   si devuelve basura, si no está? Reintentos, timeouts, mensajes de error.
5. **Matriz de pruebas** — tabla caso × tipo (unitaria/integración/e2e) con
   los nombres de los tests que se escribirán. Esta matriz la consume `/qa`.
6. **Seguridad** — entradas no confiables, secretos, inyección, permisos.
   Si hay superficie seria, recomienda `/seguridad` post-implementación.

## Fase 3 — Supuestos ocultos

Lista todo lo que el plan asume sin decirlo (versiones, entornos, datos,
comportamiento de librerías). Cada supuesto: verifícalo contra el código/docs
ahora, o conviértelo en pregunta al usuario. Prohibido dejarlo implícito.

## Fase 4 — Edita y firma

Escribe las secciones en el documento del plan. Veredicto final:
**FIRMADO** (ejecutable sin decisiones abiertas) o **DEVUELTO** (lista
numerada de lo que falta). Luego:

```
node <RAIZ>/nucleo/estado.mjs etapa construir   # solo si FIRMADO
node <RAIZ>/nucleo/estado.mjs registrar plan-ing "<FIRMADO|DEVUELTO>: <resumen>"
```

Cierra recomendando `/construir` (si FIRMADO) o los pasos para destrabarlo.
