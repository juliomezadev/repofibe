---
name: docs
description: |
  Documentación con marco Diataxis, dos modos: "actualizar" detecta y corrige
  el drift entre lo shipeado y los docs (README, ARQUITECTURA, CHANGELOG);
  "generar" escribe docs faltantes desde cero investigando el código primero.
  Úsala cuando el usuario diga "actualiza los docs", "documenta esto", "el
  README está viejo", "genera la documentación", o después de /shipear.
  (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /docs — Documentación que no miente

Un doc desactualizado es un bug: le enseña al usuario un producto que ya no
existe. Regla de oro: **la fuente de verdad es el código que corre hoy** —
todo lo que escribas se verifica contra él (regla 3: lee antes de escribir;
regla 1: los comandos documentados se EJECUTAN antes de documentarse).

## Modo 1 — Actualizar (drift tras shipear)

1. **Alcance del drift.** `git diff <base>...HEAD --stat` (o el rango que
   diga el usuario). Con el mapa (`mapa.mjs ver`) lista TODOS los archivos
   de docs del proyecto (README, ARQUITECTURA, CONTRIBUTING, CLAUDE.md,
   AGENTS.md, docs/, CHANGELOG).
2. **Cruza diff contra docs.** Por cada símbolo, comando, flag, ruta o
   flujo que cambió en el diff: Grep dirigido en los docs. Cada mención
   desactualizada es un hallazgo `archivo:línea`.
3. **Corrige con verificación.** Cada comando que quede documentado se
   ejecuta antes (o se marca por qué no se puede). Cada ruta se comprueba
   con el mapa. Nada de "debería seguir funcionando".
4. **CHANGELOG**: si el cambio es visible para el usuario y no está en el
   changelog, agrégalo en lenguaje de usuario (qué cambió y por qué importa).

## Modo 2 — Generar (docs faltantes desde cero)

1. **Investiga primero.** Mapa + lectura quirúrgica del módulo a documentar:
   entradas, flujos principales, configuración. PROHIBIDO documentar de
   memoria o por el nombre de los archivos.
2. **Elige el tipo Diataxis según la necesidad real** (no escribas los
   cuatro por defecto):

| Tipo | Responde | Cuándo |
|---|---|---|
| **Tutorial** | "llévame de la mano la primera vez" | Onboarding de usuarios nuevos |
| **Cómo-hacer** | "tengo esta tarea concreta" | Tareas frecuentes con pasos |
| **Referencia** | "¿qué opciones/flags/campos existen?" | APIs, CLIs, configs — exhaustivo y seco |
| **Explicación** | "¿por qué es así?" | Decisiones de arquitectura, trade-offs |

3. **Escribe verificando**: cada snippet se corre, cada salida mostrada es
   salida real capturada, cada ruta existe. En español claro, sin relleno
   ("Potencia tu productividad" está prohibido — di qué hace).

## Mapa de cobertura (ambos modos)

Cierra con una tabla módulo × tipo Diataxis: ✅ existe y está al día /
🔶 existe pero driftea / ✖ falta. Los huecos críticos se proponen como
siguiente `/docs generar`; los menores van a `estado.mjs pendiente`. Esta
tabla va en el cuerpo del PR si hay uno.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar docs "<modo>: <n> archivos actualizados, <n> huecos detectados"
```

Commits atómicos `docs: <qué>`. Si esto corre dentro de `/shipear` (paso 5),
los cambios van en el mismo PR — docs y código viajan juntos.
