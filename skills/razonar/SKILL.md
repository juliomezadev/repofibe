---
name: razonar
description: |
  Modo de razonamiento profundo: aplica el playbook completo de Fable
  (descomposición por valor de información, alternativas con condición de
  arrepentimiento, evidencia en contra, pre-mortem, calibración sé/creo/
  supongo) a cualquier decisión difícil. Úsala cuando el usuario diga
  "piénsalo a fondo", "razona esto", "¿qué harías tú?", "analiza bien antes",
  o ante decisiones irreversibles/ambiguas en cualquier otra skill. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /razonar — Razonamiento profundo

Carga y ejecuta `plantillas/razonamiento-profundo.md` COMPLETO (misma carpeta
que el preámbulo). Esta skill no añade metodología nueva: fuerza a que la que
existe se ejecute por escrito, paso a paso, sin saltos.

## Ejecución (visible, no mental)

Produce las secciones en este orden, todas por escrito:

1. **Dimensión** — irreversibilidad y peor caso, en una línea cada uno. Si
   ambas son bajas, dilo y recomienda decidir rápido sin el resto del
   playbook (razonar de más también es un error).
2. **Descomposición** — las 3-7 preguntas del nudo, ordenadas por valor de
   información, cada una marcada `[verificable]` o `[decidible]`.
3. **Verificaciones** — ejecuta AHORA las verificables (leer código, correr
   comandos, buscar docs) y anota el resultado con su evidencia. Las que no
   puedas verificar en esta sesión quedan como supuestos declarados.
4. **Alternativas** — mínimo 2, idealmente 3: qué optimiza / qué sacrifica /
   "me arrepentiría si ___". Busca la tercera que disuelve el trade-off.
5. **Pre-mortem** — "esto falló en 2 semanas: la causa más probable fue ___"
   → mitigación hoy o aceptación por escrito.
6. **Recomendación** — conclusión primero, porqué en 2-3 líneas, descartadas
   con razón, y supuestos etiquetados **sé / creo / supongo**. Si la decisión
   final es de gusto, formato RECOMENDACIÓN y la decide el usuario.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar razonar "<decisión>: <recomendación en una línea>"
node <RAIZ>/nucleo/memoria.mjs agregar decision "<qué se decidió y el criterio que la definió>"
```

Si el razonamiento reveló que una convención aceptada estaba equivocada,
regístralo como `eureka` — esos son los hallazgos más valiosos de la fábrica.
