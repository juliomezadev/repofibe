# Guardia ejecutable de REPOFIBE para Codex

`hooks/codex/hooks.json` registra `PreToolUse` para `Bash` y `apply_patch`. El handler lee el evento JSON por `stdin` y responde con el esquema admitido de Codex (`hookSpecificOutput.permissionDecision`: `allow` o `deny`). La evaluación está en `nucleo/ejecutar-seguro.mjs`; `--ejecutar` activa además un runner local restringido.

## Cobertura deliberadamente acotada

El `apply_patch` controlado tambien deniega cambios a su propio handler, `hooks/codex/hooks.json`, `nucleo/ejecutar-seguro.mjs` y el manifiesto del plugin Codex. Para actualizar la politica se requiere una revision/configuracion administrativa fuera de la sesion gobernada.

La raíz autorizada para una petición es el `cwd` absoluto que Codex envía. El handler valida el directorio físico y rechaza enlaces/junctions en el camino. Para Bash, el `workdir` opcional debe existir y quedar dentro de esa raíz. Para `apply_patch`, solo admite directivas de actualización o adición con rutas relativas dentro de la raíz; deniega rutas absolutas, `..`, enlaces, destinos no escribibles, eliminaciones, movimientos y directivas desconocidas.

La allowlist de Bash reconoce formas literales de `node --version`, `git status --short`, `git diff --check` y `node --test <archivos>`. Las pruebas requieren rutas explícitas existentes bajo `tests/` o `evals/` y sufijos `.test`/`.spec` con `.mjs`, `.js` o `.cjs`. No admite shell compuesto, pipes, redirecciones, variables, wrappers, opciones adicionales, globbing ni comandos de PowerShell. Reset, clean, borrado, push, merge, rebase y varios patrones destructivos se bloquean con un código explicativo. Todo lo demás falla cerrado como `COMMAND_NOT_ALLOWED`.

Los rechazos no usan `ask`: Codex documenta que `ask` no es una decisión válida para `PreToolUse`; el hook devuelve `deny`. Si una operación necesita autorización, la decisión debe resolverse por el flujo de permisos/configuración de Codex antes de habilitar una política compatible. No edites la definición de guardia para autoautorizar una operación dentro de la misma tarea.

## Runner restringido

`node nucleo/ejecutar-seguro.mjs --ejecutar` recibe el mismo JSON por `stdin`, vuelve a evaluar el evento y solo traduce formas de la allowlist a binario y argumentos fijos mediante `spawnSync` con `shell: false`. No ejecuta el comando recibido como texto de shell. Para `node --test`, cada ruta se comprueba bajo el directorio del repositorio y se entrega como argumento individual. El cuerpo del test sí es código ejecutable del proyecto; el runner no convierte una prueba potencialmente hostil en un sandbox del sistema operativo. Úsalo con repositorios de confianza y conserva el aislamiento/permisos de Codex.

En Windows, una invocación desde PowerShell puede usar entrada JSON temporal o una tubería. Ejemplo de evento sintético:

```powershell
$payload = '{"hook_event_name":"PreToolUse","cwd":"C:\\repo-sintetico","tool_name":"Bash","tool_input":{"command":"node --test evals\\smoke.test.mjs","workdir":"C:\\repo-sintetico"}}'
$payload | node .\nucleo\ejecutar-seguro.mjs --ejecutar
```

Para verificar únicamente la decisión como Codex, invoca `hooks/codex/guardia.mjs` con el mismo JSON. No incluyas comandos ni contenido de archivos en los logs.

## Evidencia local

El hook no escribe en el proyecto por defecto. Para conservar evidencia, define `REPOFIBE_GUARD_LOG` con una ruta absoluta dentro de `%TEMP%`; el handler rechaza rutas de log fuera del directorio temporal, registra fecha, herramienta, decisión, código y hashes, y omite el comando y los argumentos. Si se configuró el log y no se puede escribir, la petición se deniega. La eval `evals/seguridad/guardia-codex.mjs` crea el log solo dentro de un repo temporal sintético y elimina ese sandbox al terminar.

## Límites de seguridad y operación

Esta guardia es un control adicional para los eventos que realmente pasan por el hook. No es un límite universal del agente ni sustituye el sandbox/permisos del sistema:

- Codex expone herramientas locales a `PreToolUse`, pero documenta rutas especializadas que pueden eludir la intercepción; algunas operaciones continuadas, como `write_stdin`, tampoco vuelven a disparar `PreToolUse`.
- Codex debe revisar y confiar la definición del hook. Instalar un plugin no equivale a confiar en sus hooks.
- Si Codex no puede cargar un hook, el formato de respuesta no es válido o se alcanza el timeout, el host puede informar del fallo y continuar la operación. Este código responde `deny` ante errores que puede manejar, pero no puede controlar el comportamiento del host cuando el propio hook no se ejecuta o queda fuera de tiempo.
- El análisis no interpreta Bash ni PowerShell de forma completa. La sintaxis no reconocida se deniega; no se intenta adivinar la intención ni se presenta la lista de patrones como completa.
- `apply_patch` solo cubre el formato de parche que reconoce. MCP, editores integrados, terminales, herramientas específicas y otros caminos deben protegerse por sus propios permisos o controles.
- La raíz es `cwd`, no la raíz Git descubierta implícitamente. Si el agente necesita editar otra carpeta, debe iniciar una sesión con el alcance apropiado y permisos explícitos.

La documentación oficial describe eventos, entrada JSON, salidas válidas, cobertura y límites: [Codex Hooks](https://learn.chatgpt.com/docs/hooks). La confianza y el descubrimiento de hooks empaquetados se explican en [Package your plugin](https://developers.openai.com/plugins/build/plugins).

## Eval Windows

Ejecuta `node evals/seguridad/guardia-codex.mjs` con Node 22 o Node 24. La prueba usa JSON por `stdin` con los campos de `PreToolUse`, corre un test sintético allowlisted, verifica `node --version`, comprueba que reset/clean/borrado quedan denegados antes de ejecución, valida paths fuera de scope y entradas malformadas, y comprueba que sentinels locales y externos no cambien. No usa el perfil Codex del usuario ni invoca operaciones destructivas.
