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
4. ✅ Memoria y orientación: recuperación relevante (`memoria.mjs buscar`),
   impacto transitivo (`grafo.mjs impacto`), orientación estructural
   (`mapa.mjs`) y selección de tests afectados (`pruebas.mjs afectadas`,
   cruza `git diff` con `impactoTransitivo` de `grafo.mjs`) — los cuatro
   `[IMPLEMENTADA]`. El propio smoke test manual de `pruebas.mjs` encontró
   un bug real antes de llegar a producción: `[...s1, ...s2]` sobre strings
   de git hacía spread carácter por carácter en vez de por línea
   ("Cambiados: 16" con letras sueltas). Corregido y cubierto por eval.
5. ✅ Legal colombiano: fuentes oficiales allowlisted, vigencia, fecha de
   consulta, incertidumbre calibrada y escalamiento a abogado. Contrato de
   respuesta obligatorio verificado en `evals/legal/validar.mjs`.
6. ✅ Adaptadores multi-host: instalación/actualización/desinstalación con
   evals funcionales para genérico (`evals/seguridad/instalacion-segura.mjs`)
   y ahora también Claude Code y Antigravity
   (`evals/seguridad/instalacion-hosts.mjs`) — hogar temporal, PATH filtrado
   para forzar el fallback a copia de forma determinista sin depender de si
   la máquina tiene el CLI de `claude` instalado, ownership verificado
   (edición del usuario sobrevive a refrescar/quitar), y para Antigravity
   además el bloque de reglas en `GEMINI.md` y los lanzadores de workflow.
   codex/cursor/opencode comparten la misma función `copiarSkills` que ya
   está cubierta indirectamente; sin eval dedicada por host todavía.
7. 🔶 Navegador, deploy, canary y benchmark: `/desplegar` y `/canario` ahora
   corren sobre `nucleo/salud.mjs` `[IMPLEMENTADA]` — detección de
   proveedor, medición HTTP real (fetch + timeout + hash de contenido) y
   comparación pura contra línea base, con eval funcional que levanta un
   servidor HTTP local real (sin red externa). `/segunda-opinion` y `/spec`
   ahora corren sobre `nucleo/secretos.mjs` `[IMPLEMENTADA]` — redacción de
   secretos fail-closed (AWS, GitHub, GitLab, OpenAI, Slack, JWT, PEM,
   cadenas de conexión, asignaciones genéricas) con eval que cubre
   detección positiva, ausencia de falsos positivos en placeholders/env
   refs, y un caso específico que fija en rojo el bug real encontrado antes
   de shipear (el chequeo de placeholder usaba el nombre de la clave en vez
   del valor cuando la clave era más larga que el umbral). Lo que queda
   GUIADA en las tres skills es exactamente lo que debe serlo: confirmar el
   merge, interpretar CI, decidir si una regresión amerita rollback,
   interpretar la opinión de otro modelo — juicio del usuario, no código.
   Navegador propio y benchmark siguen PLANEADOS.

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

## Auditoría 2026-07-19 (post punto 7)

Con los 7 puntos del orden de ejecución cerrados, primera pasada de
auditoría general en vez de saltar directo al ítem grande siguiente
(navegador propio — genuino océano, no cabe en una iteración). Hallazgo
real: 5 skills (`contexto`, `desplegar`, `canario`, `segunda-opinion`,
`pruebas-afectadas`) existían con código y evals pero no aparecían en
`README.md` ni en la lista de `hooks/sesion.mjs` — invisibles en la UX y en
el contexto inyectado al abrir sesión, a pesar de que cada commit
individual actualizó `CHANGELOG.md` y `COMPARACION-GSTACK.md`. Corregido en README, y en `sesion.mjs` corregido por CAUSA RAÍZ, no solo
detección: la lista dejó de copiarse a mano y ahora se genera con
`readdirSync(skills/)` en cada invocación del hook, exactamente el mismo
principio que ya usaba `bloqueReglas()` en `instalar.mjs` — verificado de
punta a punta simulando el hook por stdin real (no solo leyendo el código),
con las 28 skills apareciendo correctamente. `evals/validar.mjs` ahora
tiene dos redes: una verifica que README documente cada skill (aquí sí solo
detección, porque el README es prosa que un humano/agente escribe, no algo
generable), y otra verifica que `sesion.mjs` liste dinámicamente — probado
que ambas detectan el drift de verdad (se rompió `README.md` a propósito,
falló, se restauró, pasó).
