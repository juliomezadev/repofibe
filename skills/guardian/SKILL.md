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

### Garantía del hook en Claude Code

- El hook reconoce únicamente las rutas exactas `.fabrica/guardia.json` y
  `.fabrica/congelar.json` bajo la raíz activa. Un archivo con el mismo nombre
  en otra carpeta, una ruta que pase por un enlace simbólico o una configuración
  que no se pueda leer no recibe esa excepción.
- Con congelamiento válido, Edit/Write solo permite rutas reales dentro del
  directorio indicado y las dos rutas operativas exactas. Bash y PowerShell se
  deniegan completos; el hook no intenta decidir por regex si un comando es
  seguro. Las herramientas de lectura dedicadas siguen disponibles.
- Un archivo de congelamiento invalido tambien bloquea Bash, PowerShell y las
  ediciones cuyo limite no se pueda comprobar. Si la ruta es un archivo regular,
  se puede reparar escribiendo `.fabrica/congelar.json` con Edit/Write; el hook
  pide confirmacion cuando no puede demostrar que la proteccion se mantiene o
  aumenta.
- Si `guardia.json` es invalido, Bash y PowerShell se bloquean hasta repararlo
  con Edit/Write por la ruta exacta. La telemetria no cambia estas decisiones
  de politica.
- Si `.fabrica` o el archivo de congelamiento es un enlace, el hook deniega esa
  ruta y sus alias. El usuario debe corregir el enlace desde una herramienta
  externa que no pase por el hook; el shell de la sesion congelada sigue bloqueado.
- Para levantar un congelamiento activo, reemplaza su contenido por `{}` con
  Edit/Write y confirma el `ask` del hook. Después se habilitan de nuevo los
  comandos de shell. No intentes borrarlo con Bash mientras siga activo.

El hook de Claude Code da una decisión determinista solo para las herramientas
que intercepta. En hosts sin este hook, incluidas las integraciones que dependen
de instrucciones, la garantía es más débil y no equivale a un sandbox.

## Operaciones

| El usuario dice | Haz |
|---|---|
| "ten cuidado" / "guardián on" | Escribe `.fabrica/guardia.json` con `{"activo": true}` y confirma qué patrones vigila (rm -rf, reset --hard, push --force, DROP TABLE, format...) |
| "guardián off" | Escribe `{"activo": false}`. Advierte una línea de qué pierde |
| "congela a <dir>" | Verifica que el directorio existe; escribe `.fabrica/congelar.json` con `{"directorio": "<dir>"}`. Desde ya, toda edición fuera se DENIEGA (en Claude Code) |
| "descongela" | Reemplaza el contenido exacto de `.fabrica/congelar.json` por `{}` con Edit/Write y confirma la solicitud del hook. |
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
