# Plan: ¿integrar un grafo de código a repofibe?

Decisión razonada con el playbook completo (`/razonar`). 2026-07-18.

## 1. Dimensión

- **Irreversibilidad:** baja — integrar un consumidor de grafos es aditivo y
  removible. Presupuesto de pensamiento: medio.
- **Peor caso si sale mal:** un grafo desactualizado le miente al agente y
  edita código que ya no existe. Este riesgo gobierna el diseño (ver
  pre-mortem).

## 2. Qué se verificó (nivel: sé)

- `graphify-out/` es la salida de una herramienta de grafos de código
  ejecutada sobre **HYNTIBIA** (no sobre repofibe), el 2026-05-08 — dos
  meses desactualizada hoy.
- Formato: `graph.json` estilo NetworkX (nodos = archivos + símbolos con
  `source_file` y línea; comunidades Louvain), `manifest.json` con
  mtime+hash por archivo (permite detectar frescura), reporte MD y árbol
  HTML. 7.5MB, 75 archivos fuente, ~3M palabras.
- **El dato decisivo:** 15,978 nodos y 16,085 aristas — ratio ≈ 1.0. Un
  grafo de llamadas real tiene muchas más aristas que nodos; ratio 1.0
  significa que es casi puro "archivo contiene símbolo" (un árbol), con
  poquísimas conexiones cruzadas. Sus 2,115 comunidades confirman la
  fragmentación: demasiado granular para servir de mapa arquitectónico.
- La herramienta generadora NO está en la carpeta (solo su salida). No
  sabemos dónde vive ni si se puede re-ejecutar. (nivel: sé que no está aquí;
  supongo que el usuario la corrió desde otro lado.)

## 3. La pregunta correcta

No es "¿grafo sí o no?" sino: **¿qué preguntas responde un grafo que
`mapa.mjs` + Grep no responden ya?**

- `mapa.mjs` responde DÓNDE está algo (estructura y nombres). ✅ cubierto
- Grep responde DÓNDE se usa un símbolo (textual, directo). ✅ cubierto
- Un grafo responde lo que falta: **"¿qué se rompe si toco X?"**
  (dependencias inversas transitivas — radio de impacto), **"¿cuáles son
  los archivos críticos?"** (hubs más conectados) y **"¿qué módulos
  conceptuales existen?"** (comunidades). Grep lo hace lento e incompleto;
  el grafo lo hace en una consulta.

Esas tres consultas SÍ valen — para `/revisar` (cazador de contratos rotos),
`/plan-ing` (arquitectura real vs planeada), `/seguridad` (superficie
crítica) y `/complejo` (mapear el territorio).

## 4. Alternativas

**A) Integrar graphify como dependencia** (repofibe ejecuta la herramienta).
Optimiza: potencia del grafo AST. Sacrifica: cero-deps, y dependemos de una
herramienta que no sabemos dónde vive ni si se mantiene. *Me arrepentiría
si:* la herramienta queda huérfana o no corre en otra máquina. **Descartada.**

**B) Adoptar el formato, no la herramienta + grafo propio de imports.**
Dos piezas:
  1. `nucleo/grafo.mjs` **consume** cualquier `graph.json` NetworkX si
     existe (graphify u otra herramienta), con chequeo de frescura
     obligatorio vía manifest (mtimes vs disco).
  2. El mismo `grafo.mjs` **genera** un grafo de imports propio
     (regex de `import`/`require`/`from X import` — sin AST, <2s, cero
     deps, siempre fresco) que cubre el 80% del valor: dependencias
     directas e inversas entre archivos, impacto transitivo, hubs.
Optimiza: valor del grafo sin dependencias nuevas y sin el riesgo de
staleness. Sacrifica: granularidad de símbolo (queda a nivel archivo; Grep
cubre el nivel símbolo). *Me arrepentiría si:* nadie usa las consultas —
costo pequeño, aceptable. **← ELEGIDA.**

**C) No integrar nada.** Optimiza: foco. Sacrifica: las consultas de
impacto, que son reales. *Me arrepentiría si:* /revisar sigue encontrando
contratos rotos tarde. **Descartada por B a bajo costo.**

## 5. Pre-mortem ("falló en 2 semanas porque...")

1. **El grafo stale mintió** → mitigación: toda consulta imprime primero la
   frescura; si >10% de archivos cambiaron, el grafo externo se marca
   NO CONFIABLE y se usa el de imports regenerado al vuelo.
2. **7.5MB al contexto** → mitigación: `grafo.mjs` responde CONSULTAS con
   salida top-N; está prohibido volcar el grafo. Nunca se lee graph.json
   con Read: siempre vía el script.
3. **Falsos positivos del regex de imports** (imports dinámicos, alias) →
   aceptado por escrito: es una aproximación; para certeza total está Grep.

## 6. Plan de ejecución (iteraciones del loop)

- [x] **F1 — `nucleo/grafo.mjs`**: `generar` (grafo de imports propio →
      `.fabrica/grafo.json`), `impacto <archivo>` (dependientes inversos
      transitivos, profundidad ≤4), `deps <archivo>`, `hubs [n]`,
      `frescura`. Soporte de lectura para graph.json externo
      (`externo <ruta>`) con chequeo de manifest. *Verificado en vivo: la
      frescura marcó el graphify-out de HYNTIBIA como NO CONFIABLE (136/136
      archivos ya no existen) — el pre-mortem #1 ocurrió de verdad.*
- [x] **F2 — skill `/grafo`**: cuándo usar qué consulta; cableado a
      `/revisar` (impacto antes del veredicto), `/ubicar` (paso 6:
      relaciones), `/plan-ing` (arquitectura real), `/complejo` (mapa del
      territorio).
- [x] **F3 — evals**: proyecto sintético con imports cruzados → `impacto`
      devuelve el cierre transitivo correcto; frescura confiable tras generar.
- [x] **F4 — docs**: README, COMPARACION-GSTACK (otra ventaja sin
      infraestructura: gstack necesita gbrain+embeddings para "code-refs";
      repofibe lo hace con un JSON local).

## 7. Recomendación (conclusión primero)

**Sí al grafo, no a la herramienta.** Construir `grafo.mjs` propio de
imports (siempre fresco, cero deps) + consumidor del formato NetworkX con
chequeo de frescura para grafos externos como el de graphify. El graphify-out
de HYNTIBIA se usará como fixture de prueba del consumidor externo, no como
fuente de verdad.

Supuestos declarados: *creo* que el regex de imports cubre la mayoría de los
casos JS/TS/Python de tus proyectos; *sé* que el graph.json actual es casi
un árbol y está stale; *supongo* que graphify se puede re-ejecutar desde
donde el usuario la instaló.

## 8. Actualización del modelo (2026-07-18, misma tarde)

El usuario aportó la guía completa de graphify: es una herramienta viva
(Apache 2.0, PyPI `graphifyy`, Python 3.10+), con AST tree-sitter de 25
lenguajes, subagentes para relaciones semánticas con etiquetas de confianza
(EXTRACTED/INFERRED/AMBIGUOUS), comunidades Leiden, `/graphify query|path|
explain`, y — crucial — `graphify hook install` que reconstruye el grafo en
cada commit, resolviendo el pre-mortem #1 (staleness) de raíz.

**Decisión refinada:** la alternativa B evoluciona a una jerarquía de
motores en `/grafo`: (1) graphify si está instalado y fresco — el motor
rico; (2) `grafo.mjs` propio — fallback cero-deps que siempre funciona;
(3) Grep — confirmación a nivel símbolo. El supuesto "no sabemos si la
herramienta se puede re-ejecutar" quedó refutado: se puede
(`py -m pip install graphifyy`, verificado Python 3.14 en la máquina).
Lo construido no se tira: grafo.mjs es exactamente el fallback que la
jerarquía necesita.
