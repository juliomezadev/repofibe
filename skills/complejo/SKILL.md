---
name: complejo
description: |
  Resolver y construir problemas MUY complejos (multi-día, multi-módulo,
  alta incertidumbre) con el método completo de Fable: cuaderno de
  razonamiento persistente, árbol de dependencias, ataque por valor de
  información (la mayor incertidumbre primero), verificación pieza a pieza e
  integración continua. Úsala cuando el usuario diga "esto es muy complejo",
  "problema grande", "constrúyeme el sistema completo", "no sé ni por dónde
  empezar", o cuando /fabrica detecte un océano. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` Y `plantillas/razonamiento-profundo.md` completos
(en esta skill el playbook profundo no es opcional). `<RAIZ>` = esa raíz.

# /complejo — Problemas muy complejos

Un problema muy complejo excede cualquier memoria de trabajo — la tuya y la
de cualquier ventana de contexto. Por eso el método NO es "pensar más
fuerte": es **externalizar el razonamiento a un cuaderno escrito** que
sobrevive a sesiones, contextos y hasta a otros agentes, y avanzar por
piezas verificadas que nunca se vuelven a discutir.

## Fase 0 — ¿De verdad es complejo?

Test: ¿cabe en un sprint normal de `/fabrica` (una feature, un módulo, <1
día)? Si sí, PARA y usa el ciclo normal — usar el cañón con moscas es
desperdicio. Sigue solo si hay: múltiples módulos que interactúan, incógnitas
técnicas reales, o trabajo que cruzará varias sesiones.

## Fase 1 — Entender (sin tocar nada)

1. Reescribe el problema con tus propias palabras y confírmalo con el
   usuario: la mitad de los problemas complejos son en realidad un problema
   simple mal contado.
2. Define **"resuelto"** como lista de criterios verificables (comandos,
   tests, comportamientos observables — no adjetivos).
3. Separa restricciones duras (no negociables) de preferencias.

## Fase 2 — El cuaderno de razonamiento

Crea `.fabrica/problemas/<slug>.md` — la memoria de trabajo externa. Secciones
obligatorias:

```
# <problema>
## PROBLEMA        (reescritura confirmada)
## CRITERIOS       (la lista de "resuelto", con checkbox cada uno)
## MAPA            (qué existe, qué falta, qué se desconoce — Fase 3)
## ÁRBOL           (subproblemas con dependencias — Fase 4)
## DEMOSTRADO      (hechos verificados con su evidencia; solo crece)
## SUPUESTOS       (creencias sin verificar, etiquetadas creo/supongo)
## DECISIONES      (qué se decidió, criterio, alternativas descartadas)
## BITÁCORA        (fecha + qué pasó, 1 línea por sesión de trabajo)
```

**Regla de oro:** toda sesión (esta o futura, tuya o de otro agente) empieza
leyendo el cuaderno y termina actualizándolo. Lo DEMOSTRADO no se re-litiga;
los SUPUESTOS se promueven a DEMOSTRADO solo con evidencia.

## Fase 3 — Mapear el territorio

ANTES de descomponer: lee el código existente, la documentación, y busca
cómo otros resolvieron esto (buscar antes de construir, 3 capas). El mapa
distingue tres zonas: **existe** (se reutiliza), **falta** (se construye),
**se desconoce** (se investiga). Todo al cuaderno.

## Fase 4 — Descomponer en árbol de dependencias

Divide en subproblemas donde cada uno tiene: criterio propio de "resuelto",
dependencias explícitas (`[depende de: X]` o `[independiente]`), y tamaño de
sprint normal o menor (si un subproblema sigue siendo un océano, se
descompone recursivamente). La descomposición inicial SIEMPRE está
parcialmente mal — revisarla en los hitos es señal de salud, no de fracaso.

## Fase 5 — Orden de ataque: incertidumbre primero

NO se empieza por lo fácil ni por el orden lógico. Se empieza por la pieza
con **mayor incertidumbre técnica** — la que puede invalidar el diseño
entero. Si hace falta, spike: un prototipo desechable de una hora que
responde "¿esto es siquiera posible?" antes de invertir días. El objetivo es
que las sorpresas lleguen la semana 1, no la semana 4. Lo trivial se deja
para el final (o para subagentes).

## Fase 6 — El ciclo por subproblema

Para cada subproblema, en orden:

1. Si tiene decisiones difíciles → `/razonar` (por escrito, al cuaderno).
2. Spec mínima del subproblema (criterio + contrato) — o `/spec` si es grande.
3. `/construir` con disciplina (test primero, checkpoints atómicos).
4. Verificar contra SU criterio, con evidencia → mover a DEMOSTRADO.
5. **Integrar y probar el TODO**, no solo la pieza — la complejidad vive en
   las interacciones, no en las piezas.
6. Actualizar cuaderno: BITÁCORA + árbol (¿la realidad cambió el plan?).

**Paralelismo:** si el host soporta subagentes (Claude Code), los
subproblemas `[independiente]` pueden ir en paralelo — cada subagente recibe
el cuaderno + su subproblema como brief autocontenido, y sus resultados
vuelven al cuaderno por el coordinador.

## Fase 7 — Hitos (cada ~3 subproblemas o al 50%)

Pre-mortem sobre lo que falta, crítica hostil sobre lo hecho, y re-visita
del árbol con lo aprendido. Tres subproblemas atascados seguidos = la
descomposición está mal → vuelve a Fase 4 con lo DEMOSTRADO como base.

## Fase 8 — Cierre

Los CRITERIOS de Fase 1 se verifican uno a uno con evidencia pegada (regla
1: nada de "debería cumplirse"). Retro corta al cuaderno. Eurekas y trampas
a la memoria:

```
node <RAIZ>/nucleo/estado.mjs registrar complejo "<slug>: <n>/<n> criterios verificados"
node <RAIZ>/nucleo/memoria.mjs agregar eureka "<el hallazgo más valioso del problema>"
```
