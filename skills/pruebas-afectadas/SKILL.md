---
name: pruebas-afectadas
description: |
  Selección de tests afectados por un cambio: cruza git diff con el grafo de
  imports para saber qué pruebas correr sin ejecutar la suite completa, y
  qué archivos cambiaron sin ningún test que los cubra. Úsala cuando el
  usuario diga "¿qué tests corro?", "selecciona las pruebas afectadas",
  "¿este cambio tiene cobertura?", o durante /construir en cambios grandes
  antes de correr todo. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /pruebas-afectadas — Selección por impacto

En una suite grande, "corre todo" a veces significa "no corras nada" (por
lento). Esta skill responde con precisión: de todo lo que existe, ¿qué
puede haberse roto?

## Uso

```
node <RAIZ>/nucleo/grafo.mjs generar          # si no hay grafo o está viejo (grafo.mjs frescura)
node <RAIZ>/nucleo/pruebas.mjs afectadas               # cambios sin commitear + staged + untracked
node <RAIZ>/nucleo/pruebas.mjs afectadas main...HEAD   # cambios de una rama entera
node <RAIZ>/nucleo/pruebas.mjs afectadas --json        # para consumir el resultado programáticamente
```

Devuelve dos listas: **pruebas potencialmente afectadas** (archivos de test
en el radio de impacto transitivo de lo que cambió) y **sin test detectado**
(archivos que cambiaron y ningún test parece alcanzarlos, ni directa ni
transitivamente).

## Cómo usarlo con criterio

1. **Antes de un `/qa` o `npm test` en un cambio grande**: corre esto
   primero. Si la lista de pruebas afectadas es manejable, corre solo esas
   con el runner del proyecto (`npx vitest run <archivos>`,
   `pytest <archivos>`, etc.) para iterar rápido — y corre la suite
   completa igual antes de `/shipear` (esto acelera el ciclo, no lo
   reemplaza; regla del propio script: "heurística, no oráculo").
2. **La lista "sin test detectado" es la más valiosa.** Si un archivo que
   cambió no tiene ningún test en su radio de impacto, es una señal de
   hueco de cobertura — hiérvela (regla 5): escribe el test ahora, no lo
   pospongas.
3. **Ante duda real** (el grafo puede no ver imports dinámicos, DI, side
   effects): corre la suite completa. Esta skill reduce trabajo en el
   camino feliz; nunca es la última palabra sobre si algo está cubierto.

## Límite honesto

La detección es por imports estáticos (mismo motor que `/grafo`): un test
que depende de una variable de entorno, un archivo leído en runtime, o
inyección de dependencias sin import directo, no aparece en el radio de
impacto aunque sí lo cubra en la práctica. Dilo si el usuario pregunta por
garantías — esto es "reduce el conjunto a probar primero", no "prueba que
cubriste todo".

**Trampa real con checkpoint continuo** (encontrada por la eval tier 2,
`evals/e2e/sprint-completo.mjs`): `pruebas.mjs afectadas` sin argumento
compara el ÁRBOL DE TRABAJO — pero `checkpoint.mjs guardar` hace
`git add -A` antes de commitear, así que si `/contexto` con checkpoint
continuo ya guardó el cambio, el árbol de trabajo vuelve a estar limpio y
"afectadas" sin argumento no encuentra nada útil (solo archivos de estado
sueltos como `.fabrica/sprint.json`). Con checkpoint continuo activo, usa
siempre un rango explícito contra el commit BASE del sprint:
`node <RAIZ>/nucleo/pruebas.mjs afectadas <commit-base-del-sprint>`.
