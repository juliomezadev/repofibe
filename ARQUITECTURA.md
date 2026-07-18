# Arquitectura

Este documento explica **por qué** repofibe está construido así. Para uso,
ver README.md; para principios, FILOSOFIA.md.

## La idea central

Una fábrica de software agéntica tiene tres clases de garantía, y cada regla
del sistema debe vivir en la clase más fuerte que pueda pagarse:

```
1. DETERMINISTA  — hooks del harness, scripts, schemas.  Se cumple SIEMPRE.
2. ESTRUCTURAL   — estado en disco, convenciones validadas por evals.
3. PROMPT        — instrucciones en SKILL.md.  Se cumple casi siempre.
```

gstack vive casi entero en la clase 3 (Markdown excelente, pero Markdown).
repofibe baja todo lo que puede a las clases 1 y 2:

| Regla | En gstack | En repofibe |
|---|---|---|
| "Cuidado con comandos destructivos" | Prompt (`/careful`) | Hook PreToolUse (`hooks/guardia.mjs`) → clase 1 |
| "No edites fuera del módulo" | Prompt (`/freeze`) | Hook PreToolUse con deny → clase 1 |
| "Retoma el contexto de la sesión" | Prompt + docs | Hook SessionStart + `.fabrica/sprint.json` → clases 1+2 |
| "Cada etapa sabe qué pasó antes" | Convención de docs | Estado explícito con historial → clase 2 |
| "Los docs de skills no driftean" | Build step (tmpl→md) | Sin codegen + evals que validan referencias → clase 2 |

Las skills (clase 3) quedan para lo que SÍ es juicio: qué preguntar, cómo
retar un plan, cuándo parar.

## Decisiones y sus porqués

### Plugin nativo / copias planas, nunca symlinks

gstack instala con `git clone` + symlinks y en Windows sin Developer Mode
degrada a copias congeladas que exigen re-ejecutar setup tras cada pull. 
repofibe elimina la clase de bug: en Claude Code es un plugin nativo (el
harness gestiona carga, hooks y actualizaciones); en el resto de hosts son
copias planas idempotentes — reinstalar ES actualizar. `~/.repofibe/instalado.json`
registra cada ruta escrita, así la desinstalación es exacta, no heurística.

### Node puro, cero dependencias

gstack necesita Bun + build de un binario de ~58MB, y en Windows tiene que
caer de vuelta a Node por un bug de Bun con Playwright. repofibe usa lo que
ya está en todas partes: Node 18+ y `.mjs` sin `node_modules`. No hay build
step, no hay binario desactualizado, no hay "funciona en mi Mac". El costo:
sin SQLite nativo — por eso la memoria es JSONL (que además es legible,
versionable y a prueba de corrupción total).

### Estado del sprint como archivo, no como convención

`.fabrica/sprint.json` (escritura atómica: tmp + rename) es el contrato entre
skills: `oficina` escribe `etapa: planear`, `plan-ing` escribe `etapa:
construir` solo si FIRMA, `shipear` exige ver el historial de `revisar`/`qa`
para el tablero de pre-vuelo. Esto hace el pipeline **reanudable** (cualquier
sesión, cualquier host, incluso otro agente) y **auditable** (el historial es
evidencia, no memoria del modelo).

### El estándar Agent Skills como formato canónico

SKILL.md con frontmatter `name` + `description` ya lo leen Claude Code,
Antigravity, Codex y Cursor. repofibe no inventa formato propio ni genera
docs: **el archivo canónico es el instalado**. Los bloques compartidos
(preámbulo, protocolo de razonamiento) son archivos en `plantillas/` que la
skill manda leer en runtime — una sola fuente, cero drift, y el costo de
contexto se paga solo cuando la skill se usa.

Cada skill localiza su raíz con una regla de dos pasos (dos niveles arriba;
si no, `~/.repofibe/app`), porque los hosts copian las skills a rutas
distintas y el instalador siempre deja el núcleo compartido en `~/.repofibe/app`.

### Hooks fail-open

`guardia.mjs` y `sesion.mjs` envuelven TODO en try/catch y salen 0 ante
cualquier error interno. Un guardia que rompe la sesión del usuario es peor
que ningún guardia. La decisión "ask" (no "deny") para destructivos preserva
la soberanía del usuario: la fábrica alerta, el humano decide. "Deny" se
reserva para el congelamiento, que el propio usuario activó.

### Evals que ejecutan, no que leen

`evals/validar.mjs` no se limita a lint: corre `estado.mjs`, `memoria.mjs` y
`guardia.mjs` de verdad contra un directorio temporal y verifica el protocolo
completo del hook (JSON por stdin → decisión por stdout), la normalización de
acentos en la búsqueda, y los falsos positivos conocidos
(`--force-with-lease` no debe alertar). Tier 1 es gratis y corre en CI; los
tiers con LLM (E2E, juez) llegan en v0.2/v0.3.

## Lo que intencionalmente NO está (todavía o nunca)

- **Daemon de navegador propio** — v0.2. Mientras tanto `/qa` usa el mejor
  disponible: `/browse` de gstack si está instalado, o Playwright directo.
  La arquitectura del daemon de gstack (HTTP local + refs de accesibilidad)
  es correcta; la nuestra será compatible con su filosofía pero en Node.
- **Telemetría remota** — nunca por defecto. Los datos de uso son del
  usuario; `.fabrica/` y `~/.repofibe/` son suyos y punto.
- **Soporte iOS** — fuera de alcance: exige Mac + hardware; contradice
  Windows-first.
- **MCP** — el estándar Agent Skills cubre la distribución; MCP añadiría
  esquemas por request sin ganancia clara aquí. Se reevalúa si algún host
  deja de soportar skills.
