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

repofibe evita depender de symlinks para distribuir skills: usa un plugin
nativo de Claude Code cuando la CLI puede confirmar el registro y copias planas
en los demás hosts o como fallback. Para Claude Code, el fallback registra los
hooks en `~/.claude/settings.json`. La CLI del plugin confirma que el plugin
quedó registrado, pero el diagnóstico no puede demostrar que el host lo haya
cargado; lo marca `registrado_no_verificado`. No se debe confundir registro con
activación observada. `~/.repofibe/instalado.json` guarda rutas y hashes de los
archivos propios para distinguirlos de archivos ajenos o editados por el
usuario.

### Node con runtime mínimo y dependencias de QA reproducibles

gstack necesita Bun + build de un binario de ~58MB, y en Windows tiene que
caer de vuelta a Node por un bug de Bun con Playwright. repofibe usa Node 22 o
superior (24 recomendado) y `.mjs`, sin dependencias externas en el runtime.
Las pruebas de navegador fijan `playwright@1.64.1` como dependencia de
desarrollo y preparan Chromium con `npm run setup:chromium`. No hay build step
ni binario propio desactualizado. El costo:
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
(`--force-with-lease` no debe alertar). Tier 1 es gratis y corre en CI; Tier 2
incluye una sesión E2E y la suite LLM se omite sin `ANTHROPIC_API_KEY`; una
omisión no es un pase. El workflow actual prueba Ubuntu y Windows con Node 22 y
24, y macOS con Node 24; macOS con Node 22 está excluido. Tier 1 instala
Playwright y Chromium antes de correr. En sistemas que impiden crear symlinks o
junctions, las evals pueden omitir esos fixtures y lo informan; esa plataforma
no queda verificada para ese caso.

### Recibos de ejecuciones de gates

`nucleo/inteligencia/ejecuciones.mjs` guarda recibos bajo
`.fabrica/ejecuciones/` con el gate, el comando, el commit y fingerprint de las
fuentes observadas, el código de salida y hashes de logs que se persisten tras
redacción. La evidencia hace referencia al recibo por `runId` y SHA-256; el
verificador vuelve a comprobar recibo, logs y snapshot del workspace. El sync
de `.fabrica/` sólo copia memoria y notas de dominio, no estos recibos.

La garantía tiene límites: las detecciones de secretos son por patrones y no
cubren todo formato posible; el runner hereda el entorno del proceso, ejecuta
comandos sin un sandbox del sistema operativo y sólo bloquea algunas formas
obvias de publicación. Los archivos locales y sus hashes no están firmados:
quien puede escribir el workspace puede sustituir recibo, log y evidencia.
Sirven para vincular una prueba observada con el estado local del código, no
como atestación criptográfica ni como registro a prueba de manipulación.

### Fallos de instalación y rollback

El instalador toma copias de archivos y configuración antes de modificarlos y
revierte los cambios locales si detecta un error. Para no borrar trabajo
concurrente, omite restaurar una ruta que haya cambiado, se haya convertido en
enlace o tenga padres inseguros; en esos casos informa que el rollback quedó
incompleto. Los cambios hechos por la CLI de Claude se compensan aparte: sólo
retira el marketplace que pudo confirmar como recién creado y sólo cuando la
lista confirma que no quedan plugins asociados. Un fallo de la CLI de
actualización puede dejar la app local ya refrescada y el plugin nativo por
actualizar; hay que reintentar. Esta compensación no equivale a una transacción
atómica entre repofibe y Claude Code.

### Escáner experimental de cadena de suministro

Los archivos locales no rastreados `hooks/antivirus-hook.mjs` y
`nucleo/antivirus.mjs` fueron auditados en Batch 4 y rechazados: cubren
indicadores concretos de paquetes y persistencia, pero no ofrecen cobertura
general de contenido o binarios, tienen falsos positivos y no están cableados.
No forman parte del producto ni deben describirse como un antivirus.

## Lo que intencionalmente NO está (todavía o nunca)

- **Daemon de navegador propio** — v0.2. Mientras tanto `/qa` usa el mejor
  disponible: `/browse` de gstack si está instalado, o Playwright directo.
  La arquitectura del daemon de gstack (HTTP local + refs de accesibilidad)
  es correcta; la nuestra será compatible con su filosofía pero en Node.
- **Telemetría remota** — nunca, ni por defecto ni opt-in. Los datos de uso
  son del usuario; `.fabrica/` y `~/.repofibe/` son suyos y punto. Sí existe
  telemetría **local** desde v0.6.0 (`.fabrica/traza.jsonl`, apagable con
  `.fabrica/traza.json`), y es deliberadamente pobre en datos: guarda qué
  herramienta o skill se usó y qué decidió el guardia, nunca el comando, la
  ruta ni los argumentos. La regla se cumple por lista blanca en el código y
  está cubierta por una eval que intenta colar un secreto y verifica que no
  se escribe. Sin ese dato local no hay forma honesta de saber qué skills
  sirven — la alternativa era seguir priorizando por corazonada.
- **Soporte iOS** — fuera de alcance: exige Mac + hardware; contradice
  Windows-first.
- **MCP** — el estándar Agent Skills cubre la distribución; MCP añadiría
  esquemas por request sin ganancia clara aquí. Se reevalúa si algún host
  deja de soportar skills.
- **Harness²** — se diseñó una evaluación aislada en
  `docs/EXPERIMENTO-HARNESS2.md`, pero no forma parte del runtime ni de sus
  dependencias. Sus resultados publicados no se consideran evidencia sobre
  Repofibe; cualquier piloto requiere un executor compatible y un entorno
  temporal separado.
