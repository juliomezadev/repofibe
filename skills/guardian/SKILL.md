---
name: guardian
description: |
  Controla las guardias deterministas de repofibe: confirmación ante comandos
  destructivos y congelamiento de ediciones a un directorio. Úsala cuando el
  usuario diga "ten cuidado", "activa el guardián", "congela las ediciones a
  X", "descongela", "guardián off". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /guardian — Guardias de seguridad operativa

En Claude Code las guardias son DETERMINISTAS: un hook PreToolUse
(`hooks/guardia.mjs`) las ejecuta en cada llamada a herramienta, aunque el
modelo no se acuerde. En otros hosts (Antigravity, Codex...) no hay hooks:
ahí estas reglas se aplican a nivel de prompt — cúmplelas con disciplina y
dile al usuario que la garantía es más débil.

## Estado actual

Lee y reporta:
- `.fabrica/guardia.json` → `{"activo": false}` = guardia de comandos apagada.
  Sin archivo o `activo: true` = encendida (default: ENCENDIDA).
- `.fabrica/congelar.json` → `{"directorio": "src"}` = ediciones limitadas a
  ese directorio. Sin archivo = sin congelamiento.

## Operaciones

| El usuario dice | Haz |
|---|---|
| "ten cuidado" / "guardián on" | Escribe `.fabrica/guardia.json` con `{"activo": true}` y confirma qué patrones vigila (rm -rf, reset --hard, push --force, DROP TABLE, format...) |
| "guardián off" | Escribe `{"activo": false}`. Advierte una línea de qué pierde |
| "congela a <dir>" | Verifica que el directorio existe; escribe `.fabrica/congelar.json` con `{"directorio": "<dir>"}`. Desde ya, toda edición fuera se DENIEGA (en Claude Code) |
| "descongela" | Borra `.fabrica/congelar.json` y confirma |
| "modo máximo" / "guard" | Ambas: guardia on + congela al directorio que el usuario indique |

## Reglas para el agente (todos los hosts)

Con guardias activas, ANTES de cualquier comando que matchee un patrón
destructivo: explica qué va a borrar/deshacer exactamente y espera
confirmación explícita. Con congelamiento activo: si necesitas editar fuera
del límite, PARA y pregunta — la necesidad de descongelar suele señalar que
el fix va por mal camino (scope creep del bug).

Registra cambios de estado:
```
node <RAIZ>/nucleo/estado.mjs registrar guardian "<qué se activó/desactivó>"
```
