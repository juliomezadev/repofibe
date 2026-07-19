---
name: fabrica
description: |
  Orquestador de repofibe: muestra el estado del sprint, detecta la etapa
  (pensar→planear→construir→revisar→probar→shipear→retro) y encadena la
  siguiente skill. Úsala cuando el usuario diga "/fabrica", "en qué íbamos",
  "qué sigue", "estado del sprint", "retoma el trabajo", o empiece a trabajar
  sin rumbo claro. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /fabrica — Orquestador del sprint

Eres el jefe de operaciones de la fábrica. Tu trabajo: saber siempre en qué
etapa está el trabajo, qué falta, y poner en marcha la skill correcta.

## Subcomandos

- `/fabrica` o `/fabrica estado` → dashboard.
- `/fabrica iniciar <objetivo>` → nuevo sprint.
- `/fabrica siguiente` → ejecuta directamente la skill que toca.

## Dashboard (comportamiento por defecto)

1. Ejecuta `node <RAIZ>/nucleo/estado.mjs ver` y muestra el resultado
   resumido en español claro: objetivo, etapa, últimos pasos, pendientes.
2. Si no hay sprint: pregunta el objetivo (formato RECOMENDACIÓN) y ejecuta
   `node <RAIZ>/nucleo/estado.mjs iniciar "<objetivo>"`.
   **Detector de océanos:** si el objetivo cruza múltiples módulos, tiene
   incógnitas técnicas reales o no cabe en un día de trabajo, NO lo metas al
   ciclo normal: deriva a `/complejo` (cuaderno de razonamiento + árbol de
   dependencias + ataque por incertidumbre).
3. Recomienda el siguiente paso según la etapa:

| Etapa actual | Siguiente skill | Cuándo saltarla |
|---|---|---|
| pensar | `/oficina` | Ya existe documento de diseño aprobado |
| planear | `/plan-ceo` → `/plan-ing` (→ `/plan-diseno` si hay UI) | Cambio trivial (typo, config) |
| construir | `/construir` | — |
| revisar | `/revisar` | — |
| probar | `/qa` | Sin superficie ejecutable (solo docs) |
| shipear | `/shipear` | — |
| retro | `/retro` | Sprints de <1 día pueden acumular para el viernes |

4. **Enrutamiento inteligente** (como un buen manager): no todo pasa por todas
   las etapas. Un fix de infra no necesita `/plan-diseno`; un cambio de docs
   no necesita `/qa`. Di qué revisiones aplican a ESTE cambio y por qué, y
   registra la decisión: `node <RAIZ>/nucleo/estado.mjs registrar fabrica "ruta elegida: ..."`.
5. Ofrece ejecutar la siguiente skill ahora mismo. Si el usuario acepta,
   invócala directamente (herramienta Skill en Claude Code; en otros hosts,
   sigue el SKILL.md correspondiente).

## Regla de oro

Nunca inventes el estado: si `estado.mjs` falla o el archivo no existe, dilo
y ofrece iniciar sprint. El dashboard reporta la realidad, no una suposición.
