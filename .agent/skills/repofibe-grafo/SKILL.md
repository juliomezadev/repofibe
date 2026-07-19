---
name: grafo
description: |
  El grafo de código de la fábrica: quién depende de quién, qué se rompe si
  tocas un archivo (impacto), cuáles son los archivos críticos (hubs) — en
  consultas puntuales de ~20 líneas, sin leer archivos. Úsala cuando el
  usuario diga "¿qué se rompe si toco X?", "¿qué depende de esto?", "muestra
  el grafo", "¿cuáles son los archivos críticos?", o antes de editar algo
  con muchos consumidores. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /grafo — Relaciones sin leer archivos

`mapa.mjs` dice DÓNDE está cada cosa; el grafo dice QUÉ TOCA cada cosa.
Juntos son la orientación completa: ubicar + relaciones, gastando consultas
de 20 líneas en vez de lecturas de 20 archivos.

## Jerarquía de motores (usa el mejor disponible)

1. **graphify** (si `graphify --version` responde o existe `graphify-out/`
   fresco): el motor rico — AST de 25 lenguajes vía tree-sitter, relaciones
   semánticas inferidas, comunidades Leiden. Consultas:
   - `GRAPH_REPORT.md` primero (god nodes, comunidades, conexiones
     sorprendentes) — UNA lectura responde la mayoría de preguntas de
     arquitectura.
   - `/graphify query "<pregunta en español>"` — Q&A sobre la estructura.
   - `/graphify path "<A>" "<B>"` — cómo se conectan dos nodos.
   - `/graphify explain "<nodo>"` — un nodo en lenguaje plano.
   - Interpreta etiquetas: EXTRACTED = hecho (confianza 1.0); INFERRED =
     deducción con score — revisa las de score bajo antes de decisiones
     críticas; AMBIGUOUS = no decidas sobre eso sin verificar con Grep.
   - Frescura: si el proyecto tiene `graphify hook install` activo, el grafo
     se reconstruye por commit; si no, corre `/graphify . --update` antes.
2. **grafo.mjs propio** (siempre disponible, cero deps): imports JS/TS/Python,
   impacto transitivo, hubs — el fallback que nunca falta.
3. **Grep**: confirmación a nivel de símbolo, siempre la última palabra.

Si graphify no está y el proyecto lo amerita (>50 archivos), ofrece
instalarlo: `uv tool install graphifyy` (o `pipx install graphifyy`, o
`py -m pip install graphifyy` en Windows) + `graphify install` +
`graphify hook install`. Menos de 30 archivos: el grafo propio basta.

## Las consultas y cuándo usarlas

| Pregunta | Comando | Quién la usa |
|---|---|---|
| ¿Qué se rompe si toco X? | `node <RAIZ>/nucleo/grafo.mjs impacto <archivo>` | `/revisar` (cazador 3) y `/construir` ANTES de editar un archivo compartido |
| ¿De qué depende X? | `grafo.mjs deps <archivo>` | `/investigar` al trazar hacia atrás |
| ¿Cuáles son los archivos críticos? | `grafo.mjs hubs [n]` | `/seguridad` (superficie), `/plan-ing` (arquitectura real), `/complejo` (mapa del territorio) |
| ¿El grafo sigue siendo confiable? | `grafo.mjs frescura` | SIEMPRE antes de confiar en cualquier respuesta |

Primer uso en un proyecto: `node <RAIZ>/nucleo/grafo.mjs generar` (<2s,
imports JS/TS/Python por regex, cero dependencias). Regenerar es gratis:
hazlo ante cualquier duda de frescura.

## Regla de frescura (innegociable)

Un grafo viejo es peor que ningún grafo: te manda a editar código que ya no
existe. Antes de usar CUALQUIER respuesta del grafo en una decisión:
`grafo.mjs frescura`. Si dice NO CONFIABLE → regenera primero. Con grafos
externos, `externo <dir> frescura`; si no hay manifest o está desviado, el
grafo externo se ignora y punto.

## Grafos externos (graphify u otra herramienta)

Si el proyecto tiene una carpeta con `graph.json` (formato NetworkX),
repofibe la consume sin instalar nada:

```
node <RAIZ>/nucleo/grafo.mjs externo <dir> resumen    # nodos, aristas, ratio, hubs
node <RAIZ>/nucleo/grafo.mjs externo <dir> frescura   # manifest vs disco
```

Interpreta el ratio aristas/nodos: <1.2 ≈ árbol de contención (poca señal
de llamadas — sirve para inventario, no para impacto); >2 empieza a haber
relaciones reales. Los hubs externos con nombres de docs/prompts indican
grafo de contenido, no de código.

## Límites honestos (calibración)

El grafo propio es de **imports entre archivos** por regex: no ve imports
dinámicos con variables, ni inyección de dependencias, ni nivel de símbolo.
Para certeza a nivel de función está Grep (definición y call sites). El
grafo te dice DÓNDE mirar; Grep confirma. Nunca cierres un veredicto de
`/revisar` solo con el grafo.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar grafo "<consulta>: <hallazgo en una línea>"
```

Si el impacto reveló un acoplamiento sorprendente (un archivo "menor" con
radio enorme), regístralo: `memoria.mjs agregar aprendizaje` — es señal de
refactor futuro.
