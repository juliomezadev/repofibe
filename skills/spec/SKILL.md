---
name: spec
description: |
  Convierte intención vaga en una spec precisa y ejecutable, en cinco fases:
  por qué, alcance, técnica (con lectura de código obligatoria), borrador y
  archivo — con gate de calidad 7/10 y redacción de secretos antes de
  guardar. Úsala cuando el usuario diga "haz una spec", "especifica esto",
  "convierte esta idea en spec", "escribe el issue completo". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /spec — De intención vaga a spec ejecutable

Una spec es un contrato: cualquier agente (o humano) debe poder implementarla
sin volver a preguntar. Cinco fases, sin saltarse ninguna.

## Fase 1 — Por qué (el problema antes que la solución)

Del pedido del usuario extrae: ¿qué duele hoy?, ¿a quién?, ¿qué pasa si no se
hace? Si el pedido ya viene como solución ("agrega un botón que..."),
reconstruye el problema detrás y confírmalo con el usuario en una pregunta.

## Fase 2 — Alcance (la frontera explícita)

Dos listas obligatorias: **DENTRO** (qué entrega esta spec) y **FUERA** (qué
NO entrega, aunque parezca cercano — con razón de una línea cada uno). Sin
lista FUERA no hay spec: el scope creep vive en lo no dicho.

**Dedupe:** busca en `docs/fabrica/specs/` si ya existe una spec que cubra
esto total o parcialmente (`Grep` por palabras clave). Si existe, muéstrala y
pregunta: ¿extender esa o crear nueva?

## Fase 3 — Técnica (con el código en la mano)

Prohibido escribir esta sección sin haber leído el código real (regla 3).
Identifica y nombra con rutas: módulos afectados, utilidades existentes que
se reutilizan (no reinventar — buscar antes de construir), patrones del
proyecto a seguir, y el punto exacto de integración. Incluye: contratos de
datos, casos borde relevantes, y criterios de aceptación verificables
(comandos o tests concretos, no "debe funcionar bien").

## Fase 4 — Borrador + gate de calidad

Redacta la spec completa: problema, alcance (dentro/fuera), enfoque técnico,
criterios de aceptación, riesgos. Luego el **gate**: puntúala tú mismo 0-10
contra esta rúbrica — ¿implementable sin preguntas? (3 pts), ¿criterios
verificables? (3 pts), ¿alcance cerrado? (2 pts), ¿riesgos honestos? (2 pts).
**Menos de 7/10 = no se archiva**: corrige lo que falta y re-puntúa. Máximo 3
ciclos; si no llega a 7, di qué información falta del usuario.

## Fase 5 — Archivo

1. **Redacción de secretos (fail-closed, código real con eval):** antes de
   escribir el archivo, pasa el borrador por el script:
   ```
   node <RAIZ>/nucleo/secretos.mjs redactar <archivo-borrador>
   ```
   Si el resumen en stderr reporta hallazgos, usa la salida redactada (no el
   borrador original) y avisa al usuario qué tipos se redactaron.
2. Guarda en `docs/fabrica/specs/AAAA-MM-DD-<tema>-spec.md`.
3. Registra:
   ```
   node <RAIZ>/nucleo/estado.mjs plan docs/fabrica/specs/<archivo>.md
   node <RAIZ>/nucleo/estado.mjs etapa planear
   node <RAIZ>/nucleo/estado.mjs registrar spec "<tema>: gate <n>/10"
   ```

Cierra ofreciendo `/autoplan` (revisión completa automática) o `/construir`
si la spec es pequeña y obvia.
