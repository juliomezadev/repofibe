# Changelog

Todas las novedades de repofibe, versión por versión.

## Sin publicar

- **`/autoplan`**: las tres revisiones del plan (CEO → diseño → ingeniería)
  en un solo comando. Auto-decide lo objetivo con seis principios codificados
  y deja cada decisión marcada en el plan; solo las decisiones de gusto
  llegan al usuario, agrupadas en un lote.
- **`/spec`**: intención vaga → spec ejecutable en cinco fases, con lectura
  de código obligatoria, dedupe contra specs previas, gate de calidad
  auto-puntuado (≥7/10 o no se archiva) y redacción de secretos fail-closed.
- **Chequeo de actualización por sesión** en el hook SessionStart: throttled
  a una vez por hora, tolerante a red caída, solo para instalaciones vía
  clon git.
- **`/canario`**: monitoreo post-deploy con línea base tomada por
  `/desplegar` — sondea disponibilidad, latencia y contenido durante una
  ventana configurable y reporta regresiones con evidencia. Rollback
  siempre requiere confirmación explícita, nunca es automático.
- **`/desplegar`**: de PR aprobado a verificado en producción — detecta el
  proveedor de deploy (Vercel/Netlify/Fly/GitHub Pages/manual), mergea con
  confirmación explícita (acción irreversible en sistema compartido), espera
  CI y el deploy, y verifica salud con una petición HTTP real a producción
  en vez de asumir que "debería estar arriba".
- **`/segunda-opinion`**: revisión independiente del diff por otro modelo
  (Codex → Gemini → Copilot CLI, con fallback honesto etiquetado cuando no
  hay cross-modelo real). Redacta secretos antes de enviar el diff a otro
  proveedor y cruza hallazgos contra /revisar: coincidencia = señal fuerte;
  hallazgo único = se verifica leyendo el código antes de aceptarlo.
- **Instalador con ownership por hash + migración `--adoptar`**: cada archivo
  instalado queda registrado con su sha256; el refresco jamás pisa archivos
  ajenos ni modificados por el usuario. `--adoptar` migra instalaciones
  anteriores al modelo (una vez, explícito) para que las actualizaciones
  vuelvan a fluir. `--dry-run` disponible en todas las operaciones.
- **`/contexto` + checkpoint continuo**: commits WIP locales con el contexto
  del sprint en el cuerpo (sobreviven crashes y cierres de sesión),
  restauración completa de dónde ibas, y `aplanar` que consolida solo la
  racha WIP antes del PR (bisect limpio). Modo continuo opcional: /construir
  guarda checkpoint tras cada paso con `{"checkpoint_continuo": true}`.
- **`/docs`**: documentación Diataxis en dos modos — actualizar (cruza el
  diff shipeado contra todos los docs y corrige el drift con hallazgos
  archivo:línea) y generar (investiga el código primero, elige el tipo
  correcto: tutorial/cómo-hacer/referencia/explicación). Regla dura: todo
  comando documentado se ejecuta antes de documentarse. Mapa de cobertura
  módulo × tipo al cierre.
- **`/legal`**: asesor legal para builders con razonamiento en derecho
  colombiano — mapa normativo (datos personales, delitos informáticos,
  e-commerce, consumidor, software como obra), método hechos→calificación→
  norma→riesgo calibrado→checklist accionable, integración con plugins
  legales del host, y marco de honestidad: nunca citar artículos con
  certeza fingida, verificación en fuente oficial cuando el detalle importa.
- **Integración graphify**: `/grafo` usa una jerarquía de motores —
  graphify si está instalado (AST 25 lenguajes, `/graphify query|path|
  explain`, etiquetas EXTRACTED/INFERRED/AMBIGUOUS, hook de auto-rebuild
  por commit) → `grafo.mjs` propio como fallback cero-deps → Grep como
  última palabra a nivel símbolo.
- **`/grafo` + `nucleo/grafo.mjs`**: el grafo de código. Responde "¿qué se
  rompe si toco X?" (impacto transitivo prof ≤4), "¿de qué depende X?" y
  "¿cuáles son los archivos críticos?" (hubs) en consultas de ~20 líneas,
  sin leer archivos. Grafo propio de imports (JS/TS/Python, regex, <2s,
  cero deps) + consumidor de graph.json externos (NetworkX/graphify) con
  veredicto de frescura obligatorio — un grafo viejo se marca NO CONFIABLE
  en vez de mentir.
- **`/ubicar` + `nucleo/mapa.mjs`**: el sentido de orientación. El mapa
  estructural del proyecto (directorios, conteos por extensión, archivos
  clave ★) se genera en <1s sin leer contenidos; la skill encadena mapa →
  hipótesis por nombre → hipótesis por convención → Grep dirigido →
  confirmación, y responde con `archivo:línea` distinguiendo definición,
  usos y configuración. El preámbulo lo activa en toda skill que toque código.
- **`/diseno`**: consultoría de diseño y frontend que razona — entrevista
  con anti-adjetivo, recuperación quirúrgica del catálogo awesome-design-md
  (3-5 referentes por sector, jamás las ~75 fichas), sistema derivado del
  producto con porqué por token, y prohibiciones anti-slop bloqueantes.
  Produce DISENO.md que consumen /plan-diseno, /construir y /qa.
- **Regla 11 del protocolo — lectura quirúrgica**: estructura → búsqueda
  dirigida → archivo completo solo confirmado el objetivo. Prohibido leer
  todo "para tener contexto".
- **Auto-actualización real**: al detectar versión nueva, la sesión hace
  `git pull --ff-only` y refresca las skills en todos los destinos
  instalados (`instalar.mjs --refrescar`) — quien tenga repofibe se
  actualiza solo. Publicado en GitHub con CI de evals (ubuntu + windows).
- **`/complejo`**: problemas muy complejos (multi-día, multi-módulo, alta
  incertidumbre) con el método Fable completo: cuaderno de razonamiento
  persistente en `.fabrica/problemas/`, árbol de dependencias, ataque por
  valor de información con spikes, integración continua y subagentes en
  paralelo para subproblemas independientes. `/fabrica` detecta océanos y
  deriva automáticamente.
- **`/razonar` + playbook de razonamiento profundo**: el método de
  razonamiento de Fable como artefacto ejecutable (descomposición por valor
  de información, evidencia en contra, pre-mortem, calibración
  sé/creo/supongo). El preámbulo lo activa automáticamente ante decisiones
  irreversibles o ambiguas en cualquier skill, en cualquier host.

## 0.1.0 — 2026-07-18

Primera versión. El núcleo de la fábrica:

- **14 skills en español** que cubren el ciclo completo del sprint:
  pensar (`/oficina`) → planear (`/plan-ceo`, `/plan-ing`, `/plan-diseno`) →
  construir (`/construir`) → revisar (`/revisar`, `/investigar`) →
  probar (`/qa`) → shipear (`/shipear`) → reflexionar (`/retro`),
  más `/fabrica` (orquestador), `/memoria`, `/seguridad` y `/guardian`.
- **Guardias deterministas por hooks** (solo Claude Code): comandos
  destructivos piden confirmación siempre, y `/guardian congelar` limita
  ediciones a un directorio — ejecutado por el harness, no por la memoria
  del modelo.
- **Estado de sprint explícito** en `.fabrica/sprint.json`: cada skill
  registra su etapa y resultado; cualquier sesión nueva retoma donde quedó.
- **Memoria persistente** en JSONL, por proyecto y global, con búsqueda.
- **Instalador multi-host**: Claude Code (plugin nativo), Antigravity
  (skills globales + workflows), Codex, Cursor, OpenCode y genérico
  (AGENTS.md). Copias, nunca symlinks — Windows funciona igual que Unix.
- **Evals tier 1** (`node evals/validar.mjs`): validación estructural
  gratuita de skills, hooks, manifiestos y scripts.
