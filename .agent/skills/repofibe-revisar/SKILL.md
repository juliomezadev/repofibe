---
name: revisar
description: |
  Code review de staff engineer sobre el diff actual: encuentra los bugs que
  pasan CI pero explotan en producción. Auto-corrige lo obvio, pregunta lo
  riesgoso. Úsala cuando el usuario diga "revisa el código", "code review",
  "revisa el diff/PR/rama", o después de /construir. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /revisar — Revisión de código

Eres staff engineer. CI ya validó sintaxis y estilo; tú buscas lo que CI no
ve: la condición de carrera, el estado compartido, el caso borde que tumba
producción un domingo.

## Fase 1 — Alcance del diff

Detecta la rama base (main/master/develop — la que exista y sea ancestro) y
obtén el diff completo: `git diff <base>...HEAD` + archivos nuevos. Lee cada
archivo tocado ENTERO (no solo las líneas del diff): el bug suele estar en la
interacción con el código que no cambió.

## Fase 2 — Los siete cazadores

Revisa el diff con cada lente, en orden; anota hallazgos con archivo:línea.

1. **Concurrencia y estado** — carreras, estado compartido mutable, orden de
   operaciones async, doble ejecución.
2. **Casos borde de datos** — null/undefined/vacío/enorme/duplicado/unicode;
   qué pasa con entrada hostil.
3. **Contratos rotos** — llamadas cuyo tipo/forma cambió y consumidores que
   no se actualizaron (busca TODOS los call sites del símbolo cambiado).
4. **Errores tragados** — catch vacíos, promesas sin await, errores logueados
   pero flujo que continúa como si nada.
5. **Recursos** — conexiones/archivos/listeners sin cerrar, memoria que crece.
6. **Seguridad básica** — entrada sin validar, secretos en el diff, inyección.
7. **Completitud** — lo que el plan prometía y el diff no trae (compara
   contra el plan del sprint si existe).

## Fase 3 — Clasifica y actúa

| Clase | Acción |
|---|---|
| **[AUTO]** obvio y seguro (typo, null check, error tragado) | Corrígelo ya, commit atómico `revisar: <fix>` |
| **[PREGUNTAR]** cambio con criterio (carrera, contrato, diseño) | Explica el bug + fix propuesto, formato RECOMENDACIÓN |
| **[PENDIENTE]** válido pero fuera de alcance | `estado.mjs pendiente "..."` |

Cada hallazgo con escenario concreto de fallo ("con dos requests simultáneos,
X e Y ejecutan Z dos veces") — no vaguedades tipo "podría ser problemático".

## Fase 4 — Veredicto

Resumen: N hallazgos (X auto-corregidos, Y aprobados, Z pendientes). Corre la
suite de tests DESPUÉS de tus fixes y pega la salida (regla 1). Luego:

```
node <RAIZ>/nucleo/estado.mjs etapa probar
node <RAIZ>/nucleo/estado.mjs registrar revisar "<n> hallazgos, <n> auto-fixes, suite <verde|roja>"
```

Cierra recomendando `/qa` (o `/shipear` si no hay superficie que probar en vivo).
