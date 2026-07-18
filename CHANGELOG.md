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
