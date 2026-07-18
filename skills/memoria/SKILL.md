---
name: memoria
description: |
  Gestiona lo que la fábrica aprendió: patrones del proyecto, trampas,
  decisiones, gustos del usuario y eurekas. Revisar, buscar, agregar, podar.
  Úsala cuando el usuario diga "recuerda que...", "¿qué aprendimos de...?",
  "muéstrame la memoria", "olvida eso". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /memoria — Memoria de la fábrica

La memoria vive en dos capas JSONL, legibles y versionables:

- **Proyecto:** `.fabrica/memoria.jsonl` (viaja con el repo si se versiona)
- **Global:** `~/.repofibe/memoria.jsonl` (sigue al usuario entre proyectos)

Tipos: `aprendizaje` (patrón que funciona), `error` (trampa y cómo
detectarla), `decision` (qué se decidió y por qué), `gusto` (preferencia del
usuario), `eureka` (la convención estaba equivocada y por qué).

## Operaciones

| El usuario dice | Haz |
|---|---|
| "recuerda que X" | Clasifica el tipo tú mismo y `node <RAIZ>/nucleo/memoria.mjs agregar <tipo> "X"` (añade `--global` si trasciende este proyecto — pregunta si dudas) |
| "¿qué aprendimos de X?" | `memoria.mjs buscar "X"` y sintetiza los resultados, no los pegues crudos |
| "muéstrame la memoria" | `memoria.mjs listar 30` agrupado por tipo, con fechas |
| "olvida eso" | Edita el JSONL: elimina la línea exacta (muéstrala antes y confirma) |
| "exporta la memoria" | Copia legible en Markdown a `docs/fabrica/memoria-export.md` |

## Poda (mantenimiento)

Si al listar hay entradas obsoletas (hablan de código que ya no existe,
decisiones revertidas), propón podarlas: muestra las candidatas, el usuario
confirma, se eliminan del JSONL. Memoria vieja equivocada es peor que no
tener memoria.

## Regla de escritura

Una memoria = un hecho + por qué importa + cómo aplicarlo. "El build falla a
veces" no es memoria; "el build falla si Node <20 por el flag X — verificar
con node --version antes de investigar otra cosa" sí.
