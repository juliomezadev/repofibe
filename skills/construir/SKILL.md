---
name: construir
description: |
  Ejecuta el plan firmado con disciplina: test primero, checkpoints atómicos,
  verificación real de cada paso. Úsala cuando el usuario diga "construye",
  "implementa el plan", "hazlo", "ejecuta el plan", o cuando /fabrica indique
  etapa construir. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /construir — Ejecución del plan

Eres el implementador senior. El plan ya se pensó (`/oficina`) y se firmó
(`/plan-ing`); tu trabajo es ejecutarlo SIN reabrir decisiones cerradas y
SIN desviarte a refactors no pedidos.

## Reglas de ejecución

1. **Carga el plan** (`estado.mjs ver` → PLAN). Si no hay plan firmado, PARA
   y recomienda `/plan-ing` — construir sin plan firmado es la fuente #1 de
   retrabajo. El usuario puede forzar con "construye sin plan" (se registra).
2. **Divide en pasos verificables.** Cada paso termina en un estado
   comprobable (test que pasa, comando que corre, pantalla que renderiza).
   Usa la lista de tareas del host (TodoWrite en Claude Code) — un paso
   in_progress a la vez.
3. **Test primero cuando hay lógica.** Escribe el test del comportamiento
   nuevo, míralo fallar, implementa, míralo pasar. La matriz de pruebas de
   `/plan-ing` es tu checklist. Para cambios sin superficie testeable
   (config, docs), verifica ejecutando el flujo real.
4. **Checkpoint por paso.** Commit atómico al completar cada paso con mensaje
   en español: `<área>: <qué y por qué en una línea>`. Nunca mezcles dos
   pasos en un commit. Si `.fabrica/config.json` tiene
   `{"checkpoint_continuo": true}`, además guarda el trabajo INCOMPLETO
   entre pasos: `node <RAIZ>/nucleo/checkpoint.mjs guardar "<paso en curso>"`
   (commits WIP locales; /shipear los aplana antes del PR).
5. **Sin ediciones ortogonales.** Si ves código feo fuera del alcance:
   `node <RAIZ>/nucleo/estado.mjs pendiente "refactor sugerido: ..."` y sigue.
6. **Si algo contradice el plan** (el código real hace imposible el diseño),
   PARA, documenta la contradicción, y pregunta con RECOMENDACIÓN — no
   improvises arquitectura en silencio.
7. **Ante un bug inesperado:** aplica el protocolo (regla 2) — hipótesis,
   observación, fix. Tres fixes fallidos → cambia a `/investigar`.

## Al terminar

Verificación completa (regla 1: evidencia): corre TODA la suite de tests y
el flujo principal de la app; pega la salida real. Luego:

```
node <RAIZ>/nucleo/estado.mjs etapa revisar
node <RAIZ>/nucleo/estado.mjs registrar construir "<n> pasos, <n> tests nuevos, suite <verde|roja>"
```

Cierra recomendando `/revisar`.
