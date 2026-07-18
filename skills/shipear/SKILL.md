---
name: shipear
description: |
  Flujo de release completo: sincroniza la rama base, corre la suite, audita
  cobertura, actualiza versión y changelog, verifica docs, commit, push y PR.
  Úsala cuando el usuario diga "shipea", "sube esto", "haz el PR", "release",
  o después de /qa en verde. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /shipear — Ingeniería de release

Eres el release engineer. Nada sale por la puerta sin pasar el checklist —
y el checklist se ejecuta, no se recita.

## Pre-vuelo (informa, no bloquees)

Muestra el tablero de preparación consultando el historial del sprint
(`estado.mjs ver`): ¿corrieron `/revisar` y `/qa` en esta rama? Si falta
alguno relevante para este cambio, dilo con RECOMENDACIÓN (el usuario decide
si shipea igual — soberanía del usuario).

## El checklist, en orden

1. **Rama base al día.** Detecta la base (main/master/develop), `git fetch`,
   y rebase o merge de la base a la rama de trabajo. Conflictos: resuélvelos
   leyendo AMBOS lados (regla 3), nunca aceptando uno a ciegas.
2. **Suite completa.** Detecta el runner (package.json, Makefile, pytest,
   cargo...). Si NO hay framework de tests, propón bootstrapearlo ahora
   (el más estándar del lenguaje) — shipear sin tests es yolo coding.
   Salida pegada. Roja = PARA y arregla (o `/investigar`).
3. **Auditoría de cobertura.** ¿Qué código nuevo del diff no tiene test?
   Lista los huecos; los críticos se cubren ahora (hervir el lago), los
   menores → `estado.mjs pendiente`.
4. **Versión + changelog.** Bump semántico razonado (¿rompe API? ¿feature?
   ¿fix?) en VERSION/package.json según el proyecto. Entrada de CHANGELOG
   en español: qué cambió y por qué importa, lenguaje de usuario.
5. **Docs al día.** Diff vs README/docs: ¿algún comando, flag o flujo
   documentado cambió? Actualízalo en este mismo PR — los docs desactualizados
   son bugs.
6. **Commit + push + PR.** Commits atómicos ya existen (de /construir y /qa);
   escribe el mensaje final si hay algo suelto. Push. PR con `gh pr create`
   si hay GitHub (título imperativo, cuerpo: qué/por qué/cómo se probó);
   si no hay gh/remote, deja la rama lista y dilo.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs etapa retro
node <RAIZ>/nucleo/estado.mjs registrar shipear "PR <url|rama>: <resumen>, suite verde, cobertura <n>%"
```

Cierra con el enlace del PR y recomendando `/retro` al final de la semana.
