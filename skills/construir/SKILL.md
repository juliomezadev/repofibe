---
name: construir
description: |
  Ejecuta el plan firmado con disciplina: test primero, checkpoints atómicos,
  verificación real de cada paso. Úsala cuando el usuario diga "construye",
  "implementa el plan", "hazlo", "ejecuta el plan", o cuando /fabrica indique
  etapa construir. Incluye una ruta ligera determinista para cambios pequeños
  y de bajo riesgo; toda duda conserva el flujo estricto. (repofibe)
---

**Preselector puro obligatorio, antes del preámbulo:** localiza la instalación
REPOFIBE — sube dos niveles desde este archivo; si ahí no existe `plantillas/`,
usa `~/.repofibe/app`. `<RAIZ>` en adelante = esa raíz. Evalúa solo la petición,
las rutas previstas y la evidencia ya disponible. El selector es una lectura
pura: no consulta ni cambia estado, memoria, planes o archivos del
consumidor y no cambia el directorio actual. No cargues otras skills antes de
recibir su resultado. La forma PowerShell con entrada UTF-8 está en
`docs/MODO-LIGERO.md`; el selector debe ejecutarse con ruta absoluta:
`node "<RAIZ>\nucleo\modo-ligero.mjs" analizar --stdin --json`.

- Si devuelve `"modo": "ligero"`, no leas el preámbulo, planes, estado o
  memoria; no cargues otra skill ni crees un plan largo. Sigue el checklist
  ligero de esta skill, con las guardias, pruebas y revisión de diff intactas.
- Si devuelve estricto, falta evidencia o alcance, hay incertidumbre, el
  selector o plugin/mecanismo requerido del host falla/no está disponible,
  ejecuta el arranque obligatorio siguiente completo, sin excepciones.
- Si surge riesgo o se amplía el alcance durante una tarea ligera, detén esa
  ruta, ejecuta el arranque estricto completo y continúa con él.

**Arranque obligatorio en modo estricto:** lee `plantillas/preambulo.md` y
síguelo completo, incluyendo estado del sprint, memoria y contrato de cierre.

# /construir — Ejecución del plan

Eres el implementador senior. El plan ya se pensó (`/oficina`) y se firmó
(`/plan-ing`); tu trabajo es ejecutarlo SIN reabrir decisiones cerradas y
SIN desviarte a refactors no pedidos.

## Reglas de ejecución

1. **Modo estricto: carga el plan** (`estado.mjs ver` → PLAN). Si no hay plan firmado, PARA
   y recomienda `/plan-ing` — construir sin plan firmado es la fuente #1 de
   retrabajo. El usuario puede forzar con "construye sin plan" (se registra).
   Modo ligero: el objetivo y las rutas explícitas son el alcance; no consultes
   ni exijas un plan firmado.
2. **Divide en pasos verificables.** Cada paso termina en un estado
   comprobable (test que pasa, comando que corre, pantalla que renderiza).
   En estricto, usa la lista de tareas del host (TodoWrite en Claude Code) — un
   paso in_progress a la vez. En ligero, usa solo el checklist breve de abajo.
3. **Test primero cuando hay lógica.** Escribe el test del comportamiento
   nuevo, míralo fallar, implementa, míralo pasar. La matriz de pruebas de
   `/plan-ing` es tu checklist. Para cambios sin superficie testeable
   (config, docs), verifica ejecutando el flujo real.
4. **Checkpoint estricto por paso.** Commit atómico al completar cada paso con mensaje
   en español: `<área>: <qué y por qué en una línea>`. Nunca mezcles dos
   pasos en un commit. Si `.fabrica/config.json` tiene
   `{"checkpoint_continuo": true}`, además guarda el trabajo INCOMPLETO
   entre pasos: `node <RAIZ>/nucleo/checkpoint.mjs guardar "<paso en curso>"`
   (commits WIP locales; /shipear los aplana antes del PR). Modo ligero: no
   hagas checkpoint, commit ni otro cambio de estado salvo que el usuario lo
   pida explícitamente.
5. **Sin ediciones ortogonales.** Si ves código feo fuera del alcance:
   en estricto, registra `node <RAIZ>/nucleo/estado.mjs pendiente "refactor sugerido: ..."` y sigue. En ligero, no registres pendientes; mantén el diff dentro del alcance.
6. **Si algo contradice el plan** (el código real hace imposible el diseño),
   PARA, documenta la contradicción, y pregunta con RECOMENDACIÓN — no
   improvises arquitectura en silencio.
7. **Ante un bug inesperado:** aplica el protocolo (regla 2) — hipótesis,
   observación, fix. Tres fixes fallidos → cambia a `/investigar`.

## Checklist ligero después del preselector

Este checklist solo se usa después de que el preselector devolvió `"modo":
"ligero"`. No rellenes datos ausentes con suposiciones. El selector emite el
comando de pruebas con la ruta absoluta a la instalación REPOFIBE; ejecútalo tal
cual y conserva el directorio actual del repositorio consumidor. No hagas `cd`
a `<RAIZ>`: `nucleo/pruebas.mjs` toma el repo objetivo de `process.cwd()`.

1. Confirma que las rutas previstas coinciden exactamente con el diff real.
2. Aplica un cambio pequeño, interno y reversible, solo dentro de esas rutas.
3. Ejecuta el comando absoluto `pruebas.mjs` emitido por el selector y todas
   las pruebas afectadas. Si no se sabe cuáles son o no se detectan, eleva a
   estricto y amplía la verificación.
4. Ejecuta `git diff --check` y revisa el diff completo desde el repo consumidor.
5. Mantén guardias, permisos y confirmación de operaciones sensibles; cualquier
   riesgo o ruta extra eleva a estricto antes de seguir.

El modo ligero conserva la guardia, los permisos y la confirmación de acciones
sensibles; no habilita operaciones destructivas ni amplía el alcance. Carga
solo esta skill. Un cambio extra o inesperado cancela el flujo ligero y activa
el arranque estricto completo antes de continuar.

La definición del flujo cuenta cinco pasos y tres comandos para ligero, frente
a ocho pasos y cuatro comandos para el flujo estricto fijado en el selector.
Es una comparación reproducible de tareas prescritas; no representa una
medición de tiempo ni de latencia del modelo. El desglose y los límites están
en `docs/MODO-LIGERO.md`.

## Al terminar

Modo ligero: ejecuta y registra en la respuesta las pruebas afectadas y el
diff revisado. No cargues estado o memoria ni hagas commit.

Modo estricto: verificación completa (regla 1: evidencia): corre TODA la suite
de tests y el flujo principal de la app; pega la salida real. Luego:

```
node <RAIZ>/nucleo/estado.mjs etapa revisar
node <RAIZ>/nucleo/estado.mjs registrar construir "<n> pasos, <n> tests nuevos, suite <verde|roja>"
```

Cierra recomendando `/revisar`.
