---
name: autenticar
description: |
  Sesión autenticada para /qa, /scrape y /design-review: el usuario inicia
  sesión UNA vez en un Chromium visible, se guarda el storageState de
  Playwright (cookies + localStorage) por dominio, y navegador.mjs lo
  reinyecta en las corridas siguientes. No lee el almacén cifrado del
  navegador — más seguro y cross-platform. Úsala cuando el usuario diga
  "necesito probar la app logueado", "autentica en este sitio", "guarda mi
  sesión de X", "testea detrás del login". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /autenticar — Sesión autenticada, sin tocar credenciales cifradas

Para probar páginas detrás de login, `/qa`/`/scrape`/`/design-review`
necesitan una sesión iniciada. En vez de leer el almacén cifrado del
navegador real (SQLite + DPAPI — Windows-only, frágil, invasivo, y el
navegador mantiene lock exclusivo del archivo mientras corre), esta skill
usa el `storageState` de Playwright: el usuario autentica **una vez** en un
Chromium visible y el estado queda guardado por dominio para reusarse.

Requiere Playwright; si no está instalado, el comando lo dice.

## Guardar una sesión (una vez por sitio)

```
node <RAIZ>/nucleo/cookies.mjs guardar <dominio>
```

Abre un Chromium **visible** en `https://<dominio>`. El usuario inicia
sesión a mano (incluido MFA/CAPTCHA si aplica — por eso es visible), y al
cerrar la ventana se guarda el `storageState` en
`.fabrica/auth/<dominio>.json`. El perfil temporal se limpia solo.

**Guardarraíles:** el estado se guarda LOCAL, por dominio, y nunca se
imprime a la terminal. Es material de sesión — trátalo como credencial:
no lo pegues en chats ni lo subas a repos públicos (si sincronizas con
`sync.mjs`, su escáner de secretos lo redacta antes de push).

## Usar la sesión en una corrida

En cualquier script de `navegador.mjs`, empieza con la acción `perfil`:

```
node <RAIZ>/nucleo/navegador.mjs ejecutar '[
  {"accion":"perfil","dominio":"<dominio>"},
  {"accion":"navegar","url":"https://<dominio>/pagina-privada"},
  {"accion":"snapshot"}
]'
```

`perfil` carga el storageState guardado antes de crear la página; si no hay
sesión guardada para ese dominio, falla con un mensaje claro que dice cómo
crearla. `/qa`, `/scrape` y `/design-review` lo usan igual cuando la página
a probar requiere login.

## Gestionar sesiones guardadas

```
node <RAIZ>/nucleo/cookies.mjs listar              # dominios con sesión guardada
node <RAIZ>/nucleo/cookies.mjs retirar <dominio>   # borra la sesión de un sitio
```

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar autenticar "sesión guardada para <dominio>"
```

Recuérdale al usuario que las sesiones expiran (el sitio invalida cookies
tras un tiempo) — si `perfil` carga pero la página sigue pidiendo login,
la sesión caducó: vuelve a `guardar`.
