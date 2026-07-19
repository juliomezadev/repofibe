# Comparación repofibe vs gstack — seguimiento del superset

Objetivo declarado: **cubrir todo lo valioso de gstack y superarlo.** Este
documento es la hoja de ruta viva del loop de mejora: cada iteración toma
ítems de aquí. Estado: ✅ cubierto (igual o mejor) · 🔶 parcial · ⏳ planeado ·
🚫 descartado con razón.

**Calibración honesta (regla del `PLAN-SUPERACION.md`):** un ✅ no significa
lo mismo en todas las filas. `[IMPLEMENTADA]` = código con eval que lo
ejecuta de verdad en `evals/validar.mjs` o sus suites integradas; sin ese
sello, el ítem es `[GUIADA]` — una skill en Markdown que depende de que el
modelo la siga bien en cada sesión, sin garantía mecánica de que lo haga.
GUIADA no es un demérito (es la naturaleza de una skill de proceso, como
`/office-hours` en gstack tampoco tiene test), pero mezclarla con
IMPLEMENTADA sin decirlo es la clase de afirmación sin evidencia que la
regla 1 del protocolo prohíbe. Añadido 2026-07-18 tras encontrar 3 bugs
reales en módulos que sí tenían evals pero vivían desconectadas del runner.

Última actualización: 2026-07-18 (v0.1.0).

## Núcleo de proceso

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /office-hours (6 preguntas forzadas, 2 modos) | ✅ `/oficina` | `[GUIADA]` Igual metodología + doc de diseño alimenta el estado del sprint |
| /plan-ceo-review (4 modos de alcance) | ✅ `/plan-ceo` | `[GUIADA]` + edición directa del plan con marcas |
| /plan-eng-review (diagramas, matriz de pruebas) | ✅ `/plan-ing` | `[GUIADA]` + veredicto FIRMADO/DEVUELTO que gobierna la etapa |
| /plan-design-review (0-10, AI slop) | ✅ `/plan-diseno` | `[GUIADA]` |
| Ejecución del plan | ✅ `/construir` | `[GUIADA]`, orquestado por `checkpoint.mjs` que sí es `[IMPLEMENTADA]`. En gstack es implícito ("exit plan mode"); aquí es skill con disciplina TDD y checkpoints |
| /review (staff engineer) | ✅ `/revisar` | `[GUIADA]` 7 lentes + clasificación AUTO/PREGUNTAR/PENDIENTE |
| /investigate (Ley de Hierro, freno a los 3) | ✅ `/investigar` | `[GUIADA]` + formato hipótesis/observación/veredicto obligatorio |
| /qa y /qa-only | ✅ `/qa`, `/qa solo-reporte` | `[GUIADA]` Regresión obligatoria por fix |
| /ship (tests, versión, changelog, PR) | ✅ `/shipear` | `[GUIADA]` + tablero de pre-vuelo desde el historial del sprint |
| /retro | ✅ `/retro` | `[GUIADA]` UNA mejora accionable, no siete |
| /learn (aprendizajes por proyecto) | ✅ `/memoria` | `[IMPLEMENTADA]` `memoria.mjs` con eval funcional (agregar/buscar, normalización de acentos) + capa global y tipos (aprendizaje/error/decision/gusto/eureka) |
| /cso (OWASP+STRIDE, gate 8/10) | ✅ `/seguridad` | `[GUIADA]` |
| /careful, /freeze, /guard, /unfreeze | ✅ `/guardian` | `[IMPLEMENTADA]` `guardia.mjs` con eval funcional (destructivos→ask, congelado→deny). **Mejora estructural**: hook determinista, no prompt |
| Preámbulo compartido entre skills | ✅ `plantillas/` | `[IMPLEMENTADA]` (archivos versionados, verificados por evals de referencias rotas). Sin build step, sin drift |
| Enrutamiento inteligente de revisiones | ✅ en `/fabrica` + `nucleo/inteligencia/router.mjs` | `[IMPLEMENTADA]` el router de intención tiene 10 pruebas en `evals/inteligencia/validar.mjs` (incluye el fix de plurales del 2026-07-18) |
| /autoplan (pipeline CEO→diseño→ing automático) | ✅ `/autoplan` | `[GUIADA]` 6 principios de auto-decisión y cada decisión queda marcada en el plan (auditable); solo el gusto llega al usuario, en un solo lote |
| /spec (intent→spec en 5 fases) | ✅ `/spec` | `[GUIADA]` Gate de calidad 7/10 auto-puntuado, dedupe contra specs previas; redacción de secretos `[IMPLEMENTADA]` (`secretos.mjs`, ver Infraestructura) |
| /context-save, /context-restore | ✅ `/contexto` | `[IMPLEMENTADA]` `checkpoint.mjs` con eval funcional (guardar/restaurar/aplanar, cierre transitivo verificado) |
| Modo checkpoint continuo (WIP commits) | ✅ `checkpoint.mjs` + `/construir` | `[IMPLEMENTADA]` `aplanar` solo toca la racha WIP — imposible aplastar commits normales por accidente (verificado en evals) |

## Navegador y ojos

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| Daemon Chromium persistente (~100ms/cmd) | 🔶 | `navegador.mjs` v1 es script-por-invocación (un lanzamiento de Chromium por flujo completo), no daemon — decisión razonada en `.fabrica/problemas/navegador-propio.md`: construir un daemon sin evidencia de que el arranque sea el cuello de botella real es optimización prematura. Daemon queda para si esa evidencia aparece |
| Sistema de refs (@e1) sobre árbol ARIA | ✅ `navegador.mjs` | `[IMPLEMENTADA]` propio, sobre la API pública `ariaSnapshot()` (la interna `_snapshotForAI` que usa el MCP oficial de Playwright no está expuesta). Desambigua elementos duplicados por índice — probado con dos botones idénticos |
| /qa con navegador | ✅ `navegador.mjs` | `[IMPLEMENTADA]` motor primario de `/qa`: navegar/snapshot/click/escribir/texto/screenshot con eval end-to-end (Chromium real + servidor HTTP local) cuando Playwright está instalado, omisión clara si no. Playwright NUNCA se embebe como dependencia de repofibe — mismo patrón que graphify en `/grafo` |
| Import de cookies del navegador real | ✅ `[IMPLEMENTADA]` | `cookies.mjs` + acción `perfil` en `navegador.mjs` — NO lee el almacén cifrado del navegador (sin SQLite, sin DPAPI, sin riesgos dual-use). Usa Playwright `storageState`: el usuario autentica UNA vez en Chromium visible, `cookies.mjs guardar <dominio>` exporta storageState a `.fabrica/auth/<dominio>.json`, y `navegador.mjs ejecutar '[{accion:"perfil",dominio:"..."}]'` lo inyecta en las sesiones siguientes. Cross-platform, solo el dominio que el usuario pide (no todas sus cookies), cero deps extra |
| Handoff a navegador visible (CAPTCHA/MFA) | ⏳ v0.3 | |
| GStack Browser con branding/stealth | 🚫 | Valor marginal frente al costo; el daemon estándar basta |
| /pair-agent (compartir navegador entre agentes) | ⏳ v0.4 | |
| /scrape + domain-skills | ✅ `/scrape` + `dominio.mjs` | `[GUIADA]` sobre `navegador.mjs` `[IMPLEMENTADA]` para la navegación; `dominio.mjs` `[IMPLEMENTADA]` con eval funcional para las notas por sitio (cuarentena → activa tras 3 usos, mismo modelo que gstack). v1 no pagina ni hace scroll infinito automático — declarado como límite honesto en la skill |

## Diseño

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /design-consultation (sistema de diseño) | ✅ `/diseno` | `[GUIADA]` calibra contra ~75 sistemas de diseño reales (awesome-design-md) con lectura quirúrgica por sector/mood; deriva desde el producto, con porqués por token y prohibiciones anti-slop bloqueantes |
| /design-shotgun (variantes + tablero + taste memory) | ⏳ v0.3 | Taste memory ya tiene hogar: memoria tipo `gusto` |
| /design-html (Pretext) | 🚫 como tal | Pretext es apuesta propia de gstack; evaluaremos generación HTML de calidad sin esa dependencia |
| /design-review en vivo | ✅ `/design-review` | `[GUIADA]` sobre `navegador.mjs` `[IMPLEMENTADA]`. Audita la app REAL corriendo (no el plan): captura evidencia con Chromium real, mismas 6 dimensiones que `/plan-diseno`, y corrige con commits atómicos + screenshots antes/después como evidencia del fix, no descripción |

## Documentación, release y operación

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /document-release + /document-generate (Diataxis) | ✅ `/docs` | `[GUIADA]` Una skill, dos modos (actualizar drift / generar desde cero). Todo comando documentado se EJECUTA antes de documentarse — los docs no pueden mentir |
| /land-and-deploy + /setup-deploy | ✅ `/desplegar` | Núcleo `[IMPLEMENTADA]` (`salud.mjs detectar/base/comparar`, eval con servidor HTTP local real); confirmar el merge e interpretar CI queda `[GUIADA]` — es juicio, no mecánica. Confirmación explícita antes del merge — acción irreversible en sistema compartido |
| /canary (monitoreo post-deploy) | ✅ `/canario` | Núcleo `[IMPLEMENTADA]` (mismo `salud.mjs`: sondeo con exit code 0/1 y motivos concretos); decidir si una regresión amerita rollback queda `[GUIADA]`, nunca automático. El hash de contenido es informativo, no señal de regresión por sí solo (evita falsos positivos en deploys legítimos) |
| /benchmark (Core Web Vitals) | ✅ `/benchmark` + `benchmark.mjs` | `[IMPLEMENTADA]` LCP/CLS reales vía PerformanceObserver inyectado antes de navegar (no la API `page.accessibility` legacy — mismo cuidado que `navegador.mjs`), TTFB/recursos/bytes por Performance API estándar. Comparación pura contra línea base con umbrales relativos+absolutos (evita ruido de una sola medición). Verificado con Chromium real: LCP, CLS y conteo exacto de subrecursos medidos contra un servidor HTTP local |
| /codex (segunda opinión cross-modelo) | ✅ `/segunda-opinion` | Detección de motor y análisis cruzado `[GUIADA]`; redacción de secretos antes de enviar el diff `[IMPLEMENTADA]` (`secretos.mjs`, compartido con `/spec`) — fail-closed, eval con detección positiva + ausencia de falsos positivos en placeholders |
| /retro global multi-proyecto | ⏳ v0.4 | |

## Infraestructura

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| Multi-host (10 agentes) | 🔶 6 hosts | claude, antigravity, codex, cursor, opencode, generico. `[IMPLEMENTADA]` para genérico, claude y antigravity (`evals/seguridad/instalacion-segura.mjs` + `instalacion-hosts.mjs`: instalar/refrescar/desinstalar con ownership real, fallback determinista sin CLI de claude, bloque+lanzadores de Antigravity); codex/cursor/opencode comparten el mismo código pero sin eval dedicada. Sin config TypeScript por host — estándar Agent Skills + tabla en instalar.mjs |
| Evals tier 1 (estático, gratis) | ✅ | `[IMPLEMENTADA]` — además ejecuta núcleo, hooks e inteligencia de verdad (4 suites unificadas en `validar.mjs`) |
| Evals tier 2 (E2E con sesión real) | ✅ `evals/tier2.mjs` | `[IMPLEMENTADA]` sin LLM (assertions estructurales, no juzgadas — eso es tier 3): sesión de sprint completa simulada (pensar→retro, ~15 subprocesos reales) verificando integridad de estado/memoria/git entre `estado.mjs`, `checkpoint.mjs`, `grafo.mjs`, `pruebas.mjs`. Job separado de CI (más lento que la promesa de <5s de tier 1). El propio test encontró un gap real de integración (`pruebas.mjs afectadas` sin rango pierde el cambio si un checkpoint ya lo commiteó) — documentado en `/pruebas-afectadas` |
| Evals tier 3 (LLM-juez) | ⏳ v0.3 | |
| gbrain (base de conocimiento con embeddings) | 🔶 | `[IMPLEMENTADA]` recall básico (`memoria.mjs`); embeddings/búsqueda semántica ⏳ v0.4 |
| Orientación en el repo (gbrain code-def/code-refs) | ✅ `/ubicar` + `mapa.mjs` | `[IMPLEMENTADA]` el núcleo (`mapa.mjs generar/buscar/ver`) tiene eval funcional; el método de búsqueda en cadena de hipótesis de la skill es `[GUIADA]`. gstack necesita una DB con embeddings para esto |
| Grafo de dependencias / análisis de impacto | ✅ `/grafo` + `grafo.mjs` | `[IMPLEMENTADA]` el núcleo (`grafo.mjs impacto/deps/hubs/frescura`) tiene eval de cierre transitivo; la skill que decide cuándo usar graphify vs el propio es `[GUIADA]`. gstack no tiene nada equivalente |
| Selección de tests afectados por un cambio | ✅ `/pruebas-afectadas` + `pruebas.mjs` | `[IMPLEMENTADA]` cruza `git diff` (staged+unstaged+untracked, o un rango) con `impactoTransitivo` de `grafo.mjs`; reporta pruebas en el radio Y archivos cambiados sin ningún test que los alcance. gstack no lo tiene |
| Redacción de secretos antes de enviar código fuera | ✅ `secretos.mjs` | `[IMPLEMENTADA]` fail-closed: AWS, GitHub, GitLab, OpenAI, Slack, JWT, PEM, cadenas de conexión, asignaciones genéricas — con exclusión explícita de placeholders/env-refs para evitar falsos positivos. Compartido por `/segunda-opinion` y `/spec`. gstack redacta secretos en su sync de memoria pero no lo expone como primitiva reutilizable |
| Salud de deploy (proveedor, medición, comparación) | ✅ `salud.mjs` | `[IMPLEMENTADA]` compartido por `/desplegar` y `/canario` — detección de proveedor por archivos del repo, medición HTTP real con timeout y hash, comparación pura contra línea base con motivos concretos (nunca "hash cambió" solo, evita falsos positivos en deploys legítimos) |
| Sync de memoria entre máquinas (repo git privado) | ⏳ v0.4 | Con escáner de secretos antes de push |
| Telemetría opt-in a Supabase | 🚫 | Decisión de privacidad: analítica local siempre, remota nunca por defecto |
| Defensa anti prompt-injection (contenido no confiable) | ✅ `no-confiable.mjs` | `[IMPLEMENTADA]` sin ML, como estaba planeado: patrones de alta confianza (secuestro de instrucciones ES/EN, comandos destructivos embebidos) + envoltura explícita. `navegador.mjs` lo aplica a `snapshot`/`texto` — el contenido de página sospechoso llega con advertencia visible antepuesta, nunca oculto. Verificado con evidencia real: Chromium navegó a una página con inyección real embebida y la señal se propagó de punta a punta. Clasificador ML (canary de sesión, ensemble) sigue fuera de alcance — v0.2+ original |
| iOS QA en dispositivo real | 🚫 | Exige Mac; contradice Windows-first |
| Auto-update check por sesión | ✅ en `sesion.mjs` | `[IMPLEMENTADA]` cubierto por `evals/seguridad/instalacion-segura.mjs` (opt-in estricto `auto_actualizar === true`, raíz real vía `git rev-parse --show-toplevel`, árbol limpio obligatorio). gstack solo avisa; repofibe puede auto-actualizarse (opt-in) con `git pull --ff-only` + refresco a todos los destinos instalados |

## Ventajas de repofibe que gstack no tiene

-2. **`/legal` — asesor jurídico colombiano**: gstack no tiene nada legal.
   repofibe razona derecho colombiano para decisiones de producto (Ley
   1581/2012 datos, Ley 1273/2009 delitos informáticos, Ley 527/1999
   e-commerce, Ley 1480/2011 consumidor, Ley 23/1982 software como obra),
   con mapa normativo de orientación, integración con plugins legales del
   host (privacy-legal), calibración sé/creo/supongo obligatoria y regla
   dura contra citar artículos con certeza fingida.

-1. **`/complejo` — problemas más grandes que un contexto**: gstack no tiene
   nada para trabajo multi-sesión de alta incertidumbre. repofibe lo resuelve
   como lo resuelve Fable: cuaderno de razonamiento en disco
   (`.fabrica/problemas/<slug>.md`) con DEMOSTRADO/SUPUESTOS/DECISIONES que
   sobrevive a sesiones y agentes, árbol de dependencias recursivo, spikes
   contra la mayor incertidumbre primero, e integración continua del todo.
0. **El razonamiento como artefacto de primera clase**: el playbook de
   razonamiento profundo (`plantillas/razonamiento-profundo.md`) + la skill
   `/razonar` hacen que CUALQUIER modelo en CUALQUIER host (Gemini en
   Antigravity, Codex, Claude) piense con el mismo método: descomposición
   por valor de información, verificar antes de opinar, alternativas con
   condición de arrepentimiento, pre-mortem, calibración sé/creo/supongo.
   gstack tiene un ethos; repofibe tiene un método ejecutable.
1. **Guardias deterministas por hook** (ask/deny ejecutado por el harness).
2. **Estado de sprint explícito y reanudable** entre sesiones, hosts y agentes.
3. **`/construir` como skill de primera clase** con disciplina codificada.
4. **Instalación/desinstalación exacta** vía registro de rutas, sin heurísticas.
5. **Cero dependencias** (Node puro) — nada que compilar, nada que romperse.
6. **Todo en español**, incluidos los mensajes de error del núcleo.
7. **Evals funcionales desde v0.1** (gstack valida docs; repofibe además ejecuta).
