# Comparación repofibe vs gstack — seguimiento del superset

Objetivo declarado: **cubrir todo lo valioso de gstack y superarlo.** Este
documento es la hoja de ruta viva del loop de mejora: cada iteración toma
ítems de aquí. Estado: ✅ cubierto (igual o mejor) · 🔶 parcial · ⏳ planeado ·
🚫 descartado con razón.

Última actualización: 2026-07-18 (v0.1.0).

## Núcleo de proceso

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /office-hours (6 preguntas forzadas, 2 modos) | ✅ `/oficina` | Igual metodología + doc de diseño alimenta el estado del sprint |
| /plan-ceo-review (4 modos de alcance) | ✅ `/plan-ceo` | + edición directa del plan con marcas |
| /plan-eng-review (diagramas, matriz de pruebas) | ✅ `/plan-ing` | + veredicto FIRMADO/DEVUELTO que gobierna la etapa |
| /plan-design-review (0-10, AI slop) | ✅ `/plan-diseno` | |
| Ejecución del plan | ✅ `/construir` | **Mejora**: en gstack es implícito ("exit plan mode"); aquí es skill con disciplina TDD y checkpoints |
| /review (staff engineer) | ✅ `/revisar` | 7 lentes + clasificación AUTO/PREGUNTAR/PENDIENTE |
| /investigate (Ley de Hierro, freno a los 3) | ✅ `/investigar` | + formato hipótesis/observación/veredicto obligatorio |
| /qa y /qa-only | ✅ `/qa`, `/qa solo-reporte` | Regresión obligatoria por fix |
| /ship (tests, versión, changelog, PR) | ✅ `/shipear` | + tablero de pre-vuelo desde el historial del sprint |
| /retro | ✅ `/retro` | UNA mejora accionable, no siete |
| /learn (aprendizajes por proyecto) | ✅ `/memoria` | + capa global y tipos (aprendizaje/error/decision/gusto/eureka) |
| /cso (OWASP+STRIDE, gate 8/10) | ✅ `/seguridad` | |
| /careful, /freeze, /guard, /unfreeze | ✅ `/guardian` | **Mejora estructural**: hook determinista, no prompt |
| Preámbulo compartido entre skills | ✅ `plantillas/` | **Mejora**: sin build step, sin drift |
| Enrutamiento inteligente de revisiones | ✅ en `/fabrica` | |
| /autoplan (pipeline CEO→diseño→ing automático) | ✅ `/autoplan` | **Mejora**: 6 principios de auto-decisión y cada decisión queda marcada en el plan (auditable); solo el gusto llega al usuario, en un solo lote |
| /spec (intent→spec en 5 fases) | ⏳ v0.2 | |
| /context-save, /context-restore | 🔶 | El estado del sprint + hook SessionStart cubren el caso principal; falta snapshot completo de contexto |
| Modo checkpoint continuo (WIP commits) | ⏳ v0.2 | |

## Navegador y ojos

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| Daemon Chromium persistente (~100ms/cmd) | ⏳ v0.2 | Diseño: HTTP local + token + refs de accesibilidad, en Node |
| Sistema de refs (@e1) sobre árbol ARIA | ⏳ v0.2 | |
| /qa con navegador | 🔶 | Hoy: /browse de gstack si existe, o Playwright directo (más lento, funcional) |
| Import de cookies del navegador real | ⏳ v0.3 | En Windows exige DPAPI — diseñar con cuidado |
| Handoff a navegador visible (CAPTCHA/MFA) | ⏳ v0.3 | |
| GStack Browser con branding/stealth | 🚫 | Valor marginal frente al costo; el daemon estándar basta |
| /pair-agent (compartir navegador entre agentes) | ⏳ v0.4 | |
| /scrape + domain-skills | ⏳ v0.3 | |

## Diseño

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /design-consultation (sistema de diseño) | ⏳ v0.3 | |
| /design-shotgun (variantes + tablero + taste memory) | ⏳ v0.3 | Taste memory ya tiene hogar: memoria tipo `gusto` |
| /design-html (Pretext) | 🚫 como tal | Pretext es apuesta propia de gstack; evaluaremos generación HTML de calidad sin esa dependencia |
| /design-review en vivo | ⏳ v0.3 | Requiere navegador (v0.2) |

## Documentación, release y operación

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| /document-release + /document-generate (Diataxis) | ⏳ v0.3 | /shipear ya audita docs drift (paso 5) — falta la generación completa |
| /land-and-deploy + /setup-deploy | ⏳ v0.3 | |
| /canary (monitoreo post-deploy) | ⏳ v0.4 | |
| /benchmark (Core Web Vitals) | ⏳ v0.4 | |
| /codex (segunda opinión cross-modelo) | ⏳ v0.3 | Generalizar: cualquier CLI de otro modelo (codex, gemini) |
| /retro global multi-proyecto | ⏳ v0.4 | |

## Infraestructura

| Capacidad de gstack | repofibe | Notas |
|---|---|---|
| Multi-host (10 agentes) | 🔶 6 hosts | claude, antigravity, codex, cursor, opencode, generico. **Mejora**: sin config TypeScript por host — estándar Agent Skills + tabla en instalar.mjs |
| Evals tier 1 (estático, gratis) | ✅ | **Mejora**: además ejecuta núcleo y hooks de verdad |
| Evals tier 2 (E2E con sesión real) | ⏳ v0.2 | |
| Evals tier 3 (LLM-juez) | ⏳ v0.3 | |
| gbrain (base de conocimiento con embeddings) | 🔶 | memoria.mjs cubre recall básico; embeddings/búsqueda semántica ⏳ v0.4 |
| Sync de memoria entre máquinas (repo git privado) | ⏳ v0.4 | Con escáner de secretos antes de push |
| Telemetría opt-in a Supabase | 🚫 | Decisión de privacidad: analítica local siempre, remota nunca por defecto |
| Defensa anti prompt-injection (clasificador ML, canary) | ⏳ v0.2+ | El canary token y las reglas de contenido no confiable no requieren ML y entran antes |
| iOS QA en dispositivo real | 🚫 | Exige Mac; contradice Windows-first |
| Auto-update check por sesión | ⏳ v0.2 | Hook SessionStart ya existe; añadir chequeo de versión throttled |

## Ventajas de repofibe que gstack no tiene

1. **Guardias deterministas por hook** (ask/deny ejecutado por el harness).
2. **Estado de sprint explícito y reanudable** entre sesiones, hosts y agentes.
3. **`/construir` como skill de primera clase** con disciplina codificada.
4. **Instalación/desinstalación exacta** vía registro de rutas, sin heurísticas.
5. **Cero dependencias** (Node puro) — nada que compilar, nada que romperse.
6. **Todo en español**, incluidos los mensajes de error del núcleo.
7. **Evals funcionales desde v0.1** (gstack valida docs; repofibe además ejecuta).
