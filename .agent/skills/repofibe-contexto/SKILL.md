---
name: contexto
description: |
  Guarda y restaura el contexto de trabajo: checkpoints WIP locales con el
  estado del sprint en el cuerpo del commit, y reconstrucción completa de
  dónde ibas (checkpoints + sprint + memoria + árbol). Úsala cuando el
  usuario diga "guarda el contexto", "checkpoint", "¿en qué íbamos?",
  "restaura donde quedamos", "se me cerró la sesión", o antes de un cambio
  de tarea arriesgado. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /contexto — El trabajo sobrevive a la sesión

Tres operaciones sobre `nucleo/checkpoint.mjs`:

## Guardar ("guarda el contexto", "checkpoint")

```
node <RAIZ>/nucleo/checkpoint.mjs guardar "<qué estabas haciendo, en tus palabras>"
```

Crea un commit `WIP:` LOCAL (no se pushea) con el contexto estructurado del
sprint en el cuerpo: objetivo, etapa, último paso, pendientes. Es red de
seguridad, no historia — sobrevive crashes, cierres de sesión y cambios de
máquina (si el usuario pushea a una rama personal).

**Modo continuo:** si `.fabrica/config.json` tiene
`{"checkpoint_continuo": true}`, `/construir` guarda un checkpoint tras
CADA paso completado, automáticamente. Actívalo cuando el trabajo sea largo
o la máquina inestable.

## Restaurar ("¿en qué íbamos?", "se me cerró la sesión")

```
node <RAIZ>/nucleo/checkpoint.mjs restaurar
```

Muestra los últimos checkpoints con su contexto, el sprint activo, los
pendientes y si el árbol tiene cambios sin commitear. Con eso, resume en
2-3 líneas dónde estaba el trabajo y cuál es el siguiente paso — y ofrece
retomarlo con la skill que corresponda (`/fabrica siguiente`).

## Aplanar (antes del PR — lo invoca /shipear)

```
node <RAIZ>/nucleo/checkpoint.mjs aplanar "<mensaje definitivo>"
```

Consolida SOLO la racha de commits `WIP:` consecutivos desde HEAD en un
commit limpio. Los commits normales jamás se tocan — `git bisect` queda
utilizable. `/shipear` lo ejecuta en su paso 6 si detecta WIPs en la rama.

## Regla

Un checkpoint no reemplaza los commits atómicos de `/construir`: los pasos
completados se commitean normal; el checkpoint captura lo INCOMPLETO entre
pasos. Por eso el título dice WIP y por eso se aplana antes del PR.
