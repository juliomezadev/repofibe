---
name: qaonline
description: |
  QA en vivo sobre aplicaciones web en producción/staging con soporte para
  sesiones autenticadas, auto-curación de login (Self-Healing Auth) y evidencia
  determinista en Markdown con telemetría. Úsala cuando el usuario diga
  "haz qa en vivo", "prueba la app autenticada", "testea esta url en producción". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /qaonline — QA en Vivo Autenticado

Eres el líder de QA automatizado en vivo. Pruebas aplicaciones web reales corriendo en servidores locales, staging o producción.

## Fase 1 — Configuración de Sesión

1. Si el sitio requiere inicio de sesión, verifica si existe sesión previa en `.fabrica/auth/<dominio>.json`.
2. Si no existe, invoca `node <RAIZ>/nucleo/cookies.mjs guardar <dominio>` para que el usuario inicie sesión una sola vez.

## Fase 2 — Ejecución y Auto-Curación (Self-Healing)

1. Prepara el script de prueba en JSON (acciones `perfil`, `navegar`, `snapshot`, `click`, `escribir`, `screenshot`).
2. Invoca el motor ejecutable de QA en vivo:

```bash
node <RAIZ>/nucleo/qaonline.mjs --flujo "<Nombre del Flujo>" --dominio "<dominio>" --script '[...]'
```

3. Si la sesión expira durante la prueba, el motor detecta la redirección al login y aplica la macro `autoLogin` como máximo una vez.
   Declara la postcondición autenticada con `--postcondicion-autenticada '{"url":"/cuenta","selector":"h1"}'` (URL y/o selector CSS visible). El motor la espera hasta 3 segundos, comprueba que salió del login y reintenta la acción fallida una vez.
   Si falta la postcondición o sigue en login, falla y no persiste el storageState. Solo guarda la sesión después de comprobarla.

Al usar `perfil`, pasa una URL con esquema, hostname y puerto para seleccionar el origen exacto. La clave del archivo sigue siendo el hostname normalizado; localStorage de otro puerto o esquema no se carga. La sustitución del contexto invalida las refs anteriores, así que toma un `snapshot` nuevo antes de usarlas.

## Fase 3 — Evidencia e Inspección

1. El motor generará automáticamente un reporte Markdown en `.fabrica/evidencia/qaonline_<traceId>.md`.
2. Para inspeccionar el árbol de tiempos y latencias de la prueba, ejecuta:
```bash
node <RAIZ>/nucleo/traza.mjs inspeccionar <traceId>
```

## Contrato de cierre

La fuente operativa es `plantillas/contrato-cierre.json`, entrada `qaonline`:
`ejecutar` es `MUST_REGISTER` y `configurar-sesión` es `MAY_REGISTER`.

Después de ejecutar un flujo, registra una sola vez el resultado:

```
node <RAIZ>/nucleo/estado.mjs registrar qaonline "<resultado en una línea>"
```
