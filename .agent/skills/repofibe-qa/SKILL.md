---
name: qa
description: |
  QA sistemático de la aplicación: mapea la superficie, prueba los flujos
  reales (navegador para web, CLI para terminal), encuentra bugs, los corrige
  con commits atómicos y genera test de regresión por cada fix. Úsala cuando
  el usuario diga "prueba la app", "haz QA", "testea esto", "encuentra bugs".
  Modo solo-reporte: "/qa solo-reporte" no toca código. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /qa — Control de calidad

Eres el QA lead con ojos. No lees el código para adivinar si funciona: LO
EJECUTAS y observas. La matriz de pruebas de `/plan-ing` (si existe) es tu
punto de partida; la realidad es tu autoridad final.

## Fase 0 — Modo

`/qa solo-reporte` → misma metodología, CERO cambios de código; el output es
el reporte de bugs numerado. Por defecto: encontrar Y corregir.

## Fase 1 — Superficie y herramienta

1. Detecta qué es la app: web (URL o dev server), API, CLI, librería.
2. Elige los ojos según el host y lo instalado, en este orden:
   - Web con gstack instalado → skill `/browse` de gstack (`$B`).
   - Web sin gstack → Playwright: `npx playwright --version` para verificar;
     si falta, propón `npm i -D playwright && npx playwright install chromium`.
     Úsalo con scripts cortos de Node (goto → screenshot → assert).
   - API → curl/fetch con casos de la matriz.
   - CLI → ejecutar el binario real con entradas de la matriz.
3. Levanta la app si hace falta (busca el comando en package.json/README) y
   VERIFICA que responde antes de declarar nada.

## Fase 2 — Los flujos, en orden de sangre

1. **Camino feliz principal** — el flujo por el que existe el producto.
2. **Matriz de /plan-ing** — caso por caso, marcando resultado.
3. **Entradas hostiles** — vacío, enorme, unicode, inyección básica, doble
   submit, atrás/adelante del navegador.
4. **Estados** — cargando, error de red (corta el backend a propósito),
   sesión expirada, datos vacíos.

Por cada paso: EVIDENCIA (screenshot, salida, código de estado). Prohibido
"parece funcionar" — o lo viste o no pasó (regla 1).

## Fase 3 — Por cada bug encontrado

1. Anótalo: síntoma + reproducción mínima + severidad (bloqueante/mayor/menor).
2. (Modo por defecto) Investiga la causa (protocolo regla 2; si es profundo,
   cambia a `/investigar`), corrige, commit atómico `qa: <fix>`.
3. **Test de regresión obligatorio** por cada fix — sin excepción.
4. **Re-verifica en vivo** el flujo que fallaba, con evidencia nueva.

## Fase 4 — Reporte

Tabla: flujo | resultado | evidencia | bug/fix/regresión. Suite completa de
tests al final, salida pegada. Luego:

```
node <RAIZ>/nucleo/estado.mjs etapa shipear   # si todo verde
node <RAIZ>/nucleo/estado.mjs registrar qa "<n> flujos, <n> bugs, <n> regresiones, <verde|rojo>"
```

Cierra recomendando `/shipear` (verde) o listando los bloqueantes (rojo).
