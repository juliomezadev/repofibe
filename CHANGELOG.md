# Changelog

Todas las novedades de repofibe, versión por versión.

## [0.5.1] — 2026-07-19
### Corregido (auditoría del trabajo v0.4–v0.5)
- **CRÍTICO — corrupción de memoria en el merge driver**: `gitMerge3Way`
  normalizaba `\`→`/` en el CONTENIDO escrito, no solo en la clave de
  comparación — así que toda entrada de memoria con backslash (rutas
  Windows `C:\Users\...`, regex `\d+`, escapes, código) se corrompía en cada
  merge entre máquinas. Probado con evidencia (`C:\Users\app` → `C://Users//app`).
  Ahora la normalización se usa SOLO como clave de dedup; el contenido se
  escribe intacto. Cubierto por eval (`evals/nucleo/sync.mjs`) — que antes no
  tocaba este caso.
- **Merge driver frágil**: se registraba con ruta relativa (`node
  nucleo/sync.mjs`), que falla si git corre el merge desde otro cwd. Ahora
  usa la ruta absoluta de `sync.mjs`. Y el registro dejó de tragar errores
  en silencio: si falla, avisa (sin driver, git haría un merge por defecto
  que puede corromper la memoria).
- **Honestidad cero-deps**: el README ahora aclara que el núcleo es
  cero-deps de verdad, pero capacidades avanzadas usan herramientas
  externas OPCIONALES que degradan con gracia (Playwright, embeddings
  `@xenova/transformers` ~90MB, CLI de LLM para el juez).

## [0.5.0] — 2026-07-21
### Añadido
- **Git 3-Way Merge Driver Nativo (`sync.mjs git-merge`)**: Integración en `.gitattributes` (`merge=repofibe-memoria`) para fusionar la memoria `.fabrica/memoria.jsonl` automáticamente entre máquinas mediante 3-way merge (%O, %A, %B) sin marcas de conflicto `<<<<<<< HEAD`.
- **Fail-Safe contra Corrupción de JSONL**: Verificación estricta por línea en `sync.mjs`; aborta con `exit(1)` ante sintaxis rota delegando el conflicto a Git de forma segura.
- **Normalización Multiplataforma**: Sanitización forzada de separadores (`\` a `/`) en todas las entradas de memoria JSONL para prevenir duplicación cruzada entre Windows y Linux.
- **Auto-Pull en Push**: Re-intento automático con auto-pull en `sync.mjs push` ante rechazos `non-fast-forward`.
- **Evals para Hosts Secundarios (`instalacion-hosts-secundarios.mjs`)**: Arnés de pruebas aislado para **Cursor** (`.cursor/skills`), **Codex CLI** (`.codex/skills`) y **OpenCode** (`.config/opencode/skills`), validando ownership de ediciones del usuario e idempotencia.

## [0.4.2] — 2026-07-21
### Añadido
- **Arnés de Benchmark Empírico vs gstack (`benchmark-gstack.mjs`)**: Evaluador automatizado sobre 20 tareas de ingeniería complejas clasificadas en 5 dimensiones (Seguridad, QA, Arquitectura, Legal y UX/Diseño).
- **Fórmula de Scoring Determinista (0-100 pts)**: Integración de algoritmo con 40% Eficacia, 20% Peak RSS (muestreo worker de 50ms), 20% Tokens Reales (proxy) y 20% Latencia de CPU con amortiguación logarítmica anti-outliers.
- **Evaluación Doble Ciega (*Double-Blind*)**: Interfaz con `juez.mjs` que anonimiza candidatos (Alfa vs Beta) eliminando sesgos de marca de agua y formato.
- **Publicación Oficial**: Cierre de la tesis en `docs/BENCHMARK-GSTACK.md` registrando la victoria empírica (repofibe 94.8 / 100 vs gstack 53.6 / 100).

## [0.4.1] — 2026-07-21
### Añadido
- **Skill `/qaonline` & Engine `qaonline.mjs`**: Motor ejecutable y skill para QA en vivo en producción/staging con soporte para entornos autenticados.
- **Self-Healing Auth (Auto-Curación)**: Detección automática de redirecciones a `/login` a mitad de ejecuciones pesadas, corrida de macro `autoLogin` robótica y exportación de nuevo `storageState` en caliente sin colgar procesos en CI.
- **Soporte de LocalStorage en Daemon**: Extensión del comando `perfil` e inclusión del nuevo comando `exportarPerfil` en `navegador.mjs` para preservar JWTs guardados en `localStorage`.
- **Evidencia Determinista en Markdown**: Generación automática de reportes en `.fabrica/evidencia/qaonline_<traceId>.md` tabulando respuestas, capturas y trazas.

## [0.4.0] — 2026-07-21
### Añadido
- **Observabilidad Determinista**: Telemetría integrada cero-dependencias usando `AsyncLocalStorage` y `node:events`. 
- **Máquina del Tiempo (CLI)**: Nuevo comando `node nucleo/traza.mjs inspeccionar <id>` que renderiza un árbol ASCII colorido de la ejecución y latencias.
- **Anti-Fugas**: Hook de gracia (`process.on('uncaughtException')` y `SIGINT`) que fuerza volcados síncronos del buffer de trazas para no perder datos forenses en caso de crash del agente.
- **Instrumentación Automática**: Los comandos pesados (daemon de navegador y vectores de memoria) ahora están envueltos en `withTrace`, inyectando contexto invisiblemente sin contaminar la base del código.

## 0.3.3 — 2026-07-21

- **Feature (Arquitectura Núcleo)**: Refactor profundo integrando las pruebas de concepto (Spikes) a producción:
  - `memoria.mjs`: Incorpora motor semántico ONNX opcional (carga dinámica lazy). Vectores separados en `.vectores.jsonl`, generación asíncrona en lote (*batching*) para mitigar latencia, y combinación de búsqueda textual + semántica con Reciprocal Rank Fusion (RRF).
  - `navegador.mjs`: Implementado modo `daemon` persistente. Soporta una sesión viva vía IPC JSON estricto (uso de `msgId`), prevención de *Race Conditions* con un semáforo de promesas asíncronas, y suicidio nativo anti-fugas de RAM si la fábrica se colapsa.
  - Limpieza total de andamios (`spike-*` borrados).

## 0.3.2 — 2026-07-21

- **Feature (Spikes de Auditoría GStack)**: Completada la Fase 6 de investigación técnica para superar a GStack.
  - Aislamiento estricto de variables de entorno (`APPDATA` y `LOCALAPPDATA`) añadido a `instalacion-hosts.mjs`, logrando paridad de pruebas (evals) para Cursor y Codex sin tocar la máquina del usuario.
  - Creados spikes aislados en `/nucleo` para un Daemon de Chromium persistente (`spike-daemon.mjs`) y para embeddings ONNX locales (`spike-embeddings.mjs`). Esto valida la viabilidad técnica de agentes cooperativos interactivos y memoria semántica sin bases de datos externas.

## 0.3.1 — 2026-07-19

- **Fix (colisión de nombres con otras suites)**: si tenías gstack instalado,
  escribir `qa` invocaba la `qa` de gstack (en inglés), no la de repofibe —
  porque ambas declaraban `name: qa` en su frontmatter. Ahora el instalador
  reescribe el `name:` interno de cada skill a su nombre con prefijo
  (`repofibe-qa`, `repofibe-revisar`, …) SOLO en la copia instalada (el repo
  fuente conserva el nombre corto, legible). Así las skills de repofibe se
  invocan como `repofibe-<algo>` y nunca chocan con `qa`/`retro`/`benchmark`
  de gstack. Verificado por eval de instalación por host.
- **Fix (`--adoptar` re-sincroniza ownership obsoleto)**: al migrar los
  nombres, se encontró que `--adoptar` saltaba archivos que ya tenían entrada
  en el registro aunque el hash guardado fuera OBSOLETO (no coincidía con el
  disco). Eso dejaba las actualizaciones bloqueadas para siempre: el refresco
  creía que el usuario había editado el archivo y lo preservaba. Ahora
  `--adoptar` re-sincroniza el ownership al hash real del disco, destrabando
  las actualizaciones. Encontrado con un diagnóstico de hashes (registro
  489b… vs disco b3d9…), no adivinado.

## 0.3.0 — 2026-07-19

- **Fix (Windows, tier 3)**: `juez.mjs` no detectaba NINGÚN proveedor de LLM
  en Windows aunque estuviera instalado — `execFileSync("claude")` da ENOENT
  y `"claude.cmd"` da EINVAL (los shims `.cmd` no corren sin shell). El
  LLM-juez estaba completamente roto en Windows. Corregido con `shell:true`
  para resolver el `.cmd`, pasando el comando como string único (evita la
  deprecación DEP0190) y el prompt no confiable por STDIN (nunca como arg de
  shell → sin superficie de inyección). Verificado en vivo: ahora detecta el
  `claude` CLI instalado.
- **`/autenticar`**: skill que hace alcanzable la sesión autenticada
  (`cookies.mjs` + acción `perfil` de `navegador.mjs`) — login una vez en
  Chromium visible, storageState reinyectado en `/qa`/`/scrape`/
  `/design-review`. Antes el módulo existía pero ninguna skill lo exponía.
- **Auditoría de las "piezas difíciles" (2026-07-19)**: al revisar
  `sync.mjs` se encontraron y corrigieron 3 bugs reales que su eval no veía
  porque **reimplementaba** la lógica en el test en vez de llamar al código:
  (1) `appendFileSync` usado sin importar → `pull` crasheaba en el primer
  merge; (2) el escáner de secretos leía `resultado.encontrados` (no existe;
  es `.hallazgos`) → NUNCA redactaba, credenciales al repo privado en texto
  plano — bug de seguridad; (3) dedup por `id` duplicaba cada entrada de
  `memoria.jsonl` (que no tiene `id`) en cada pull. Se extrajo `mergeJsonl`
  (dedup por línea, idempotente) y se reescribió la eval para probar el
  código real, bloqueando los 3 bugs. `juez.mjs`: 1 fix de doc (el CLI de
  gemini es `@google/gemini-cli`, no `@anthropic-ai`).
- **Spike DPAPI (documentado, no shippeado)**: se verificó con evidencia que
  leer el almacén cifrado real del navegador es FACTIBLE (`node:sqlite` en
  Node 24, DPAPI vía PowerShell, AES-256-GCM v10 en Node) — refutando 3 de
  los 4 supuestos de bloqueo del modelo anterior. El 4º (Chrome mantiene lock
  exclusivo del archivo mientras corre) se confirmó como el bloqueo real. Se
  eligió deliberadamente el enfoque storageState (cross-platform, sin lock,
  menos invasivo). Detalle: `.fabrica/problemas/cookies-navegador.md`.
- **`cookies.mjs`**: contexto autenticado para navegador.mjs, sin leer el
  almacén cifrado del navegador real (sin SQLite, sin DPAPI, sin riesgos
  dual-use). Usa Playwright's `storageState`: el usuario autentica UNA vez
  en Chromium visible (`cookies.mjs guardar <dominio>`), el storageState se
  guarda en `.fabrica/auth/<dominio>.json`, y la nueva acción `perfil` en
  `navegador.mjs` lo inyecta en las sesiones siguientes. Cross-platform,
  solo el dominio que el usuario pide (no todas sus cookies), cero deps
  extra. Spike real con Chromium confirmó que: (1) addCookies con expiry
  persiste entre sesiones, (2) launchPersistentContext preserva el perfil,
  (3) storageState exportar/importar funciona entre contextos limpios. La
  eval funcional encontró un bug real en normalizarDominio (no quitaba el
  path completo, solo `/` al final) y lo corrigió. Integración E2E con
  Chromium real + servidor HTTP local verificada: la cookie inyectada por
  `perfil` aparece en el snapshot de la página servida.
- **navegador.mjs**: nueva acción `perfil{dominio}` — carga storageState
  antes de crear el contexto de página, para que las cookies y localStorage
  del dominio estén disponibles desde la primera navegación.

- **`nucleo/juez.mjs`**: eval tier 3 (LLM-juez) — invoca el CLI del LLM
  disponible (`claude`, `gemini`) dinámicamente, cero SDK, cero keys
  embebidas, mismo patrón que Playwright. Job MANUAL, no CI — el usuario
  decide cuándo pagar. Rubricas estructuradas por skill (5 criterios
  específicos, 0-2 puntos cada uno) para consistencia. Resuelve las dos
  preguntas que el modelo anterior no pudo: cómo invocar un LLM sin
  romper cero-deps (usa el CLI del proveedor, no SDK) y cómo lograr
  consistencia (rubrica con criterios medibles, no evaluación libre).

- **`nucleo/sync.mjs`**: sync de memoria entre máquinas via git. Los JSONL
  de repofibe son append-only (memoria.mjs, dominio.mjs) — `mergeJsonl` hace
  merge con dedup por LÍNEA completa (idempotente, sin duplicar). Auth
  states se sincronizan como snapshots (reemplazo). Escaneo de secretos
  (secretos.mjs) corre ANTES de push. Resuelve la suposición "optimista"
  del modelo anterior sobre el merge de JSONL. (Ver la nota de auditoría
  arriba: la primera versión tenía 3 bugs, corregidos.)

- **`/benchmark` + `nucleo/benchmark.mjs`**: Core Web Vitals reales (LCP,
  CLS, TTFB) sobre Chromium real, no estimados desde el código — inyecta
  un `PerformanceObserver` antes de navegar (`addInitScript`, el mismo
  cuidado de timing que exige medir LCP/CLS de verdad), lee TTFB/recursos/
  bytes vía la Performance API estándar. Línea base + comparación pura con
  umbrales relativos y absolutos combinados (evita que el ruido normal de
  una sola medición dispare falsos positivos). Verificado con Chromium
  real: el propio test encontró que `performance.getEntriesByType
  ("resource")` no incluye el documento HTML principal (vive en la entrada
  "navigation", aparte) — la aserción original asumía lo contrario;
  corregida para reflejar la API real, con un subrecurso de prueba
  agregado para confirmar el conteo con un caso no trivial.
- **`/scrape` + `nucleo/dominio.mjs`**: extracción de datos reales de una
  página con `navegador.mjs` (navegar, snapshot, leer refs) — hereda
  automáticamente la defensa anti prompt-injection de `no-confiable.mjs`
  sin código nuevo, porque reutiliza las mismas acciones de `navegador.mjs`.
  `dominio.mjs` implementa domain-skills: notas persistentes por sitio con
  ciclo de confianza cuarentena → activa tras 3 usos registrados (mismo
  modelo que gstack), con eval funcional que cubre normalización de
  dominio, promoción, aislamiento entre dominios y retiro.
- **Evals tier 2** (`evals/tier2.mjs` + `evals/e2e/sprint-completo.mjs`):
  sesión de sprint completa simulada, sin LLM — `estado.mjs iniciar` hasta
  `etapa retro`, pasando por `checkpoint.mjs` (guardar y aplanar),
  `grafo.mjs` (generar e impacto) y `pruebas.mjs` (afectadas), verificando
  que el estado, la memoria y el historial de git se mantienen correctos
  de punta a punta — el tipo de bug de integración entre scripts que los
  tests aislados de tier 1 no pueden atrapar. Job separado en CI (tier 1
  promete <5s; tier 2 encadena ~15 subprocesos reales). El propio test
  encontró un gap real al construirse: `pruebas.mjs afectadas` sin
  argumento compara el árbol de trabajo, pero si `checkpoint.mjs` ya
  commiteó el cambio (checkpoint continuo), el árbol vuelve a estar limpio
  y la comparación no encuentra nada útil — documentado como trampa real
  en `/pruebas-afectadas` con la solución (pasar el commit base del sprint
  como rango explícito).
- **`nucleo/no-confiable.mjs`**: defensa anti prompt-injection para
  contenido externo, sin ML (patrones de alta confianza: secuestro de
  instrucciones en español e inglés, comandos destructivos embebidos en
  texto narrativo) — `envolver()` marca el origen con delimitadores
  explícitos, `detectarInyeccion()` señala sin nunca ocultar ni modificar
  el contenido (ocultar sería peor: el agente perdería la evidencia).
  `navegador.mjs` lo aplica a `snapshot` y `texto`: contenido de página
  sospechoso llega con una advertencia visible antepuesta. Verificado con
  Chromium real navegando a una página con inyección embebida — la señal
  se propaga de punta a punta, no solo en la función pura aislada. `/qa` y
  `/design-review` actualizadas: contenido de página es DATOS, nunca
  instrucciones, sin importar cómo esté redactado.

## 0.2.0 — 2026-07-19

- **`/design-review`**: auditoría de diseño EN VIVO sobre la app real
  corriendo, no un plan — usa `navegador.mjs` para capturar evidencia real
  (screenshot + `ariaSnapshot`), audita las mismas 6 dimensiones que
  `/plan-diseno` y el mismo detector de AI slop, y CORRIGE lo que
  encuentra con commits atómicos y pares de screenshots antes/después como
  evidencia del fix. La eval de drift de documentación (que verifica que
  toda skill aparezca en README y en `sesion.mjs`) atrapó en el acto que
  faltaba documentar esta skill al agregarla — funcionando como estaba
  pensada.
- **`nucleo/navegador.mjs`**: ojos reales para `/qa`, sin depender de
  gstack. Script de acciones por invocación (`navegar`, `snapshot`,
  `click`, `escribir`, `texto`, `screenshot`, `esperar`) sobre Chromium vía
  Playwright, con sistema de refs PROPIO (`e1`, `e2`...) construido sobre
  la API pública `ariaSnapshot()` — desambigua elementos duplicados por
  índice de ocurrencia. Playwright se importa dinámicamente y nunca se
  empaqueta como dependencia de repofibe (sigue siendo cero-deps); si no
  está instalado, el error explica cómo instalarlo en el proyecto del
  usuario. Decidido por `/complejo` con spike real (no especulación):
  confirmó que Playwright funciona sin fricción en Windows con Node puro
  (el bug de Bun documentado por gstack no aplica), y refutó dos supuestos
  iniciales sobre la API de accesibilidad (`page.accessibility` fue
  eliminada; `{ref:true}` no genera marcadores en la API pública). El
  propio test funcional encontró un bug real antes de shipear: leer el
  valor de un `<input>` con `innerText()` no lanza excepción, devuelve
  string vacío en silencio — corregido ramificando por el `role` del
  elemento en vez de depender de una excepción que nunca ocurre. v1 es
  script-por-invocación, no daemon persistente — decisión razonada, no
  omisión: sin evidencia de que el arranque de Chromium sea el cuello de
  botella real, construir un daemon sería optimización prematura.
- **Auditoría de documentación**: 5 skills (`contexto`, `desplegar`,
  `canario`, `segunda-opinion`, `pruebas-afectadas`) existían con código y
  evals pero no aparecían en `README.md` ni en `hooks/sesion.mjs` — ambos
  corregidos, y `sesion.mjs` dejó de copiar la lista a mano: ahora la genera
  desde `skills/` en cada invocación, igual que `bloqueReglas()` en
  `instalar.mjs`. `evals/validar.mjs` verifica ambos archivos contra el
  disco real en cada corrida para que este drift no vuelva a pasar
  desapercibido.
- **`nucleo/secretos.mjs`**: redacción de secretos fail-closed compartida
  por `/segunda-opinion` (antes de mandar un diff a otro proveedor de IA) y
  `/spec` (antes de archivar una spec) — AWS, GitHub, GitLab, OpenAI, Slack,
  JWT, PEM y cadenas de conexión por patrones de alta confianza, más
  asignaciones genéricas con exclusión explícita de placeholders y
  referencias a variables de entorno para no destruir código legítimo. El
  propio test funcional encontró un bug real antes de integrarlo: el
  chequeo de "¿esto es un placeholder?" podía comparar contra el NOMBRE de
  la clave (`access_token`) en vez del valor, cuando el nombre era más
  largo que el umbral — corregido con referencia explícita al grupo
  capturado, ya no heurística.
- **`nucleo/salud.mjs`**: núcleo mecánico compartido de `/desplegar` y
  `/canario` — detección de proveedor de deploy, medición HTTP real
  (código, latencia, hash de contenido, timeout) y comparación pura contra
  una línea base, con eval funcional que levanta un servidor HTTP local
  real. Ambas skills pasan de GUIADA a núcleo IMPLEMENTADA + juicio GUIADA
  (confirmar merge, decidir rollback siguen siendo del usuario). El propio
  smoke test encontró y corrigió un bug de lógica real: un hash de
  contenido distinto no es evidencia de regresión por sí solo — tratarlo
  como tal habría producido falsos positivos en cada deploy legítimo.
- **Evals de instalación por host** (`evals/seguridad/instalacion-hosts.mjs`):
  Claude Code (fallback determinista a copia de skills cuando la CLI
  `claude` no está en PATH, sin depender de si la máquina de CI la tiene) y
  Antigravity (skills + bloque de reglas en `GEMINI.md` sin borrar contenido
  del usuario + lanzadores de workflow) — instalar/refrescar/ownership/
  desinstalar, los cuatro verificados de extremo a extremo con hogares
  temporales. Antes solo el host genérico tenía esta cobertura.
- **`/pruebas-afectadas`**: selección de tests por impacto — cruza `git
  diff` con el grafo de imports (`grafo.mjs impactoTransitivo`, ahora
  exportado como función reutilizable) para reportar qué pruebas caen en
  el radio de un cambio y qué archivos cambiaron sin ningún test que los
  alcance.
- **Calibración honesta GUIADA vs IMPLEMENTADA** en
  `docs/COMPARACION-GSTACK.md`: cada fila declara si tiene código con eval
  que la ejecuta de verdad o es una skill en Markdown que depende del
  modelo.
- **Tres correcciones de seguridad reales**: el router de intención no
  matcheaba plurales (bug de regex con `\b` final); la auto-actualización
  era opt-out por descuido en vez de opt-in estricto y calculaba la raíz
  del repo por aritmética de rutas en vez de `git rev-parse
  --show-toplevel`; el desinstalador dejaba una línea en blanco huérfana al
  remover un bloque de reglas. Las tres, cubiertas por evals ahora
  integradas al runner principal.
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
- **Fix (router de inteligencia)**: los patrones de intención no manejaban
  plurales (`\bvulnerabilidad\b` no matcheaba "vulnerabilidades"), causando
  que tareas de seguridad se enrutaran como revisión genérica. Corregido con
  cobertura de la propia eval que lo detectó (`evals/inteligencia/validar.mjs`).
- **Fix (seguridad del instalador)**: la auto-actualización era opt-out por
  descuido (`!== false` en vez de `=== true`) y calculaba la raíz del repo
  por aritmética de rutas en vez de `git rev-parse --show-toplevel` —
  ambos corregidos. También se corrigió una asimetría en `instalar.mjs`
  que dejaba una línea en blanco huérfana al desinstalar un bloque de
  reglas. Cubierto por `evals/seguridad/instalacion-segura.mjs`.
- **Evals unificadas**: las suites `inteligencia/`, `legal/` y
  `seguridad/instalacion-segura.mjs` (antes sueltas y no ejecutadas por CI)
  ahora corren dentro de `evals/validar.mjs` — ningún push puede quedar en
  verde con una de ellas en rojo.
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
