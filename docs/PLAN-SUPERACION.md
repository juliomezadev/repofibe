# Plan de superioridad de repofibe

## Tesis

Repofibe debe dirigir, verificar y limitar el trabajo del agente. Las skills
son la interfaz humana; el núcleo ejecutable debe controlar riesgo, estado,
evidencia, memoria y reversibilidad.

## Gates de producto

Una capacidad solo puede marcarse como `IMPLEMENTADA` si tiene código,
prueba automatizada y evidencia reproducible. Las categorías válidas son:

- `IMPLEMENTADA`: comportamiento ejecutable y probado.
- `GUIADA`: instrucción Markdown; depende del modelo.
- `EXPERIMENTAL`: existe, pero no tiene cobertura suficiente.
- `PLANEADA`: todavía no existe.

## Orden de ejecución

1. ✅ Seguridad del actualizador y del instalador: opt-in ESTRICTO
   (`auto_actualizar === true`, antes era opt-out por descuido — corregido),
   ownership por archivo (sha256), raíz real vía `git rev-parse
   --show-toplevel` (antes aritmética de rutas, vulnerable a copias), y
   pruebas de desinstalación sin pérdida de datos. `evals/seguridad/
   instalacion-segura.mjs`, integrado a la suite principal.
2. ✅ Núcleo confiable: guardias (`guardia.mjs`), estado (`estado.mjs`),
   grafo con hashes de contenido (`grafo.mjs`, frescura por commit) y manejo
   explícito de confianza (EXTRACTED/INFERRED/AMBIGUOUS en grafos externos).
3. ✅ Orquestador: `nucleo/inteligencia/` — tarea, plan, riesgo, modo,
   evidencia y transiciones de estado como contratos estructurados
   (`contratos.mjs`, `riesgo.mjs`, `modos.mjs`, `router.mjs`,
   `evidencia.mjs`), con CLI demostrable (`orquestador.mjs`) y 10 pruebas
   en `evals/inteligencia/validar.mjs`. El router tenía un bug real de
   coincidencia de plurales (regex singular con `\b` final no matcheaba
   "vulnerabilidades"/"secretos") — corregido y cubierto por el mismo test
   que lo detectó.
4. 🔶 Memoria y orientación: recuperación relevante (`memoria.mjs buscar`),
   impacto transitivo (`grafo.mjs impacto`) y orientación estructural
   (`mapa.mjs`) ya existen, todos `[IMPLEMENTADA]` en el sentido de este
   documento. Falta selección automática de tests afectados por un cambio
   (cruzar `git diff` con `grafo.mjs impacto` para filtrar la suite) —
   **siguiente en la cola**.
5. ✅ Legal colombiano: fuentes oficiales allowlisted, vigencia, fecha de
   consulta, incertidumbre calibrada y escalamiento a abogado. Contrato de
   respuesta obligatorio verificado en `evals/legal/validar.mjs`.
6. 🔶 Adaptadores multi-host: instalación/actualización/desinstalación
   probadas para el host genérico (`.agent/skills` + `AGENTS.md`); faltan
   pruebas equivalentes para Claude Code (plugin nativo) y Antigravity.
7. 🔶 Navegador, deploy, canary y benchmark: `/desplegar` y `/canario` ya
   existen como skills GUIADAS (instrucción para el modelo, sin código
   ejecutable propio); navegador y benchmark siguen PLANEADOS. Ninguno de
   estos entra en la categoría IMPLEMENTADA todavía — ver nota de
   calibración abajo.

**Nota de calibración (2026-07-18):** varias filas de `COMPARACION-GSTACK.md`
marcadas ✅ corresponden a skills en Markdown (categoría GUIADA de este
documento), no a código con test automatizado (IMPLEMENTADA). La distinción
importa: una skill GUIADA depende de que el modelo la siga bien en cada
sesión; una IMPLEMENTADA se comporta igual siempre. Los seis módulos con ✅
en este documento sí tienen evals que los ejecutan de verdad.

## Modos de operación

- `seguro`: aprobación antes de cualquier escritura sensible, push, deploy o
  actualización.
- `equilibrado`: automatiza lecturas y pruebas; pregunta antes de cambios de
  alto riesgo. Es el modo por defecto.
- `autónomo`: trabaja dentro de un workspace autorizado, con checkpoints y
  rollback; nunca ejecuta destructivos o deploy sin aprobación.

## Métricas para afirmar superioridad

Antes de usar “mejor que gstack”, comparar 20 tareas equivalentes y registrar:

- tasa de tareas terminadas con evidencia;
- bloqueos correctos y falsos positivos de seguridad;
- éxito de instalación y recuperación de sesión;
- tiempo, tokens y archivos leídos;
- exactitud de impacto y selección de pruebas;
- calidad y trazabilidad de respuestas legales.

Objetivo de release: cero hallazgos P1, desinstalación sin borrar archivos
ajenos, cobertura de los flujos críticos y resultados iguales o mejores en la
matriz comparativa.
