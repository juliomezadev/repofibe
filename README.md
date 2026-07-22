# repofibe — La Fábrica

**Tu equipo de ingeniería virtual, en español.** Un CEO que reta el alcance,
un eng manager que firma la arquitectura, una diseñadora que caza el AI slop,
un staff engineer que encuentra los bugs que CI no ve, un QA con ojos, un CSO
sin ruido y un release engineer que shipea el PR. 32 especialistas que
trabajan como trabaja un buen equipo: con proceso, con estado y con memoria.

Inspirado en [gstack](https://github.com/garrytan/gstack) de Garry Tan —
y rediseñado desde cero con una tesis distinta:

> **Cada garantía que pueda ser determinista, se baja al harness.**
> Un prompt que dice "ten cuidado con rm -rf" se olvida.
> Un hook que intercepta el comando, jamás.

## Las cinco diferencias estructurales

| | gstack | repofibe |
|---|---|---|
| **Instalación** | git clone + symlinks + editar CLAUDE.md (los symlinks se rompen en Windows) | Plugin nativo de Claude Code / copias planas. Windows = ciudadano de primera |
| **Guardias** | `/careful` es un prompt: el modelo puede olvidarlo | Hook PreToolUse: el harness lo ejecuta SIEMPRE (destructivos → confirmar; congelado → denegar) |
| **Estado del sprint** | Implícito en documentos sueltos | `.fabrica/sprint.json` explícito: etapa, historial, pendientes. Cualquier sesión retoma donde quedó |
| **Docs de skills** | Plantillas + build step (drift si no rebuildeas) | Sin codegen: un SKILL.md por skill, bloques compartidos leídos en runtime |
| **Multi-host** | 10 hosts vía setup TypeScript | Estándar Agent Skills puro: Claude Code, Antigravity, Codex, Cursor, OpenCode y cualquier IDE que lo adopte |

Todo en español: skills, mensajes, docs, commits.

## Instalación

**Requisitos:** [Node.js](https://nodejs.org) 18+ y Git. Nada más — cero
dependencias npm, cero binarios compilados en el núcleo.

> **Nota de honestidad:** algunas capacidades avanzadas usan herramientas
> externas OPCIONALES que se importan dinámicamente y degradan con gracia si
> no están: Playwright para navegador/QA/scrape (`/qa`, `/scrape`,
> `/design-review`, `/autenticar`), `@xenova/transformers` para búsqueda
> semántica de memoria (~90MB de modelo la primera vez; sin él, `/memoria`
> cae a búsqueda textual), y el CLI de un LLM (`claude`/`gemini`) para el
> juez tier-3. El núcleo — estado, guardias, grafo, sync, checkpoints — es
> cero-deps de verdad.

```powershell
# Windows
git clone https://github.com/juliomezasena-byte/repofibe.git
cd repofibe; .\instalar.ps1
```

```bash
# macOS / Linux / WSL
git clone https://github.com/juliomezasena-byte/repofibe.git
cd repofibe && ./instalar.sh
```

El instalador autodetecta tus hosts (Claude Code, Antigravity, Codex, Cursor,
OpenCode) e instala en todos. Para uno solo: `--host antigravity`. Para
generar los lanzadores `/repofibe-*` en un workspace de Antigravity:
`--host antigravity --workspace <ruta-del-proyecto>`. Para cualquier otro
IDE: `--host generico --workspace <ruta>` (skills + bloque en AGENTS.md).

- **Actualizar:** automático — al abrir sesión (máx. 1 vez/hora) repofibe
  detecta versión nueva, hace `git pull --ff-only` y refresca las skills en
  todos los hosts instalados. Manual: `git pull` + instalador. Apagar el
  automático: `~/.repofibe/config.json` → `{"auto_actualizar": false}`.
- **Desinstalar:** `instalar.ps1 -Quitar` / `./instalar.sh --quitar` — limpia
  todo lo que instaló (lo registra en `~/.repofibe/instalado.json`).

En Claude Code el camino preferido es el plugin nativo (incluye los hooks
deterministas): `claude plugin marketplace add <ruta-al-clon>` y
`claude plugin install repofibe@repofibe-marketplace` — el instalador lo
intenta automáticamente.

## El ciclo del sprint

**pensar → planear → construir → revisar → probar → shipear → retro**

Cada skill registra su resultado en `.fabrica/sprint.json`; la siguiente lo
lee. Nada se cae por las grietas porque cada etapa sabe qué pasó antes.

| Skill | Especialista | Qué hace |
|---|---|---|
| `/fabrica` | **Orquestador** | Dashboard del sprint, detecta la etapa, encadena la siguiente skill. Empieza aquí |
| `/razonar` | **Razonamiento Fable** | El playbook profundo aplicado por escrito: descomposición por valor de información, alternativas con condición de arrepentimiento, pre-mortem, calibración sé/creo/supongo |
| `/complejo` | **Problemas muy complejos** | Cuaderno de razonamiento persistente entre sesiones, árbol de dependencias, la mayor incertidumbre primero (spikes), integración continua, subagentes en paralelo |
| `/ubicar` | **Sentido de orientación** | Localiza cualquier cosa en un repo sin leer de más: mapa estructural (`mapa.mjs`), hipótesis por convención, Grep dirigido, confirmación con `archivo:línea` |
| `/grafo` | **Grafo de código** | ¿Qué se rompe si toco X? (impacto transitivo), hubs críticos, deps — consultas de 20 líneas sin leer archivos. Consume grafos externos (graphify/NetworkX) con chequeo de frescura obligatorio |
| `/oficina` | **Socio de YC** | Seis preguntas forzadas que reencuadran el producto antes de escribir código. Produce el doc de diseño |
| `/spec` | **Autor de specs** | Intención vaga → spec ejecutable en 5 fases, con gate de calidad 7/10 y redacción de secretos |
| `/qa` | **QA con ojos** | Control de calidad ejecutable. |
| `/qaonline` | **QA en vivo** | QA en vivo en producción/staging con Self-Healing Auth y evidencia determinista en Markdown. |
| `/plan-ceo` | **CEO fundador** | Reta premisas, busca el producto de 10 estrellas. Modos: expansión / selectiva / mantener / reducción |
| `/plan-ing` | **Eng manager** | Flujo de datos ASCII, estados, casos borde, matriz de pruebas, modos de fallo. Veredicto: FIRMADO o DEVUELTO |
| `/plan-diseno` | **Diseñadora senior** | Seis dimensiones 0-10 con "cómo se ve un 10". Detector de AI slop |
| `/diseno` | **Design partner** | Entrevista + 3-5 referentes reales del catálogo awesome-design-md (lectura quirúrgica, jamás entero) → sistema de diseño derivado del producto con tokens concretos y prohibiciones anti-slop |
| `/design-review` | **Diseñadora que mira de verdad** | Auditoría de diseño EN VIVO con `navegador.mjs`: captura la app real corriendo, mismas seis dimensiones que `/plan-diseno`, y CORRIGE con commits atómicos y screenshots antes/después |
| `/autoplan` | **Pipeline** | Las tres revisiones en un comando: auto-decide lo objetivo (6 principios, marcados en el plan), pregunta solo el gusto |
| `/construir` | **Implementador** | Ejecuta el plan firmado: test primero, checkpoints atómicos, cero ediciones ortogonales |
| `/contexto` | **Checkpoints** | Commits WIP locales con el contexto del sprint en el cuerpo (sobreviven crashes y cierres de sesión); `aplanar` consolida solo la racha WIP antes del PR sin tocar commits normales |
| `/revisar` | **Staff engineer** | Siete cazadores de bugs de producción. Auto-corrige lo obvio, pregunta lo riesgoso |
| `/segunda-opinion` | **Cross-modelo** | Revisión independiente por otro modelo (Codex/Gemini/Copilot) con redacción de secretos antes de enviar el diff y análisis cruzado contra `/revisar` |
| `/investigar` | **Debugger** | Ley de Hierro: sin fix antes de causa raíz demostrada. Freno a los 3 intentos fallidos |
| `/pruebas-afectadas` | **Selección de tests** | Cruza `git diff` con el grafo de impacto: qué pruebas correr sin la suite completa, y qué cambios quedaron sin ningún test que los alcance |
| `/qa` | **QA con ojos** | Ejecuta la app de verdad (navegador/CLI/API), corrige, y cada fix trae test de regresión. `/qa solo-reporte` no toca código |
| `/scrape` | **Extracción de datos reales** | Navega y extrae con `navegador.mjs`; guarda patrones reutilizables por dominio con `dominio.mjs` (cuarentena → activa tras 3 usos, igual que domain-skills de gstack) |
| `/autenticar` | **Sesión autenticada** | Login una vez en Chromium visible → `storageState` de Playwright guardado por dominio y reinyectado en `/qa`/`/scrape`/`/design-review`. No lee el almacén cifrado del navegador (cross-platform, sin lock, sin DPAPI) |
| `/shipear` | **Release engineer** | Base al día, suite, cobertura, versión, changelog, docs, PR |
| `/desplegar` | **Deploy verificado** | Mergea con confirmación explícita, espera CI, y verifica salud con una petición HTTP real a producción — nunca asume |
| `/canario` | **Monitoreo post-deploy** | Sondea disponibilidad y latencia contra la línea base de `/desplegar`; rollback siempre requiere confirmación del usuario |
| `/benchmark` | **Rendimiento real** | Core Web Vitals (LCP, CLS, TTFB) sobre Chromium real, línea base + comparación con motivos concretos — no adivina desde el código |
| `/retro` | **Eng manager** | Datos reales de la semana → UNA mejora accionable |
| `/docs` | **Technical writer** | Diataxis en dos modos: actualizar drift tras shipear / generar desde cero. Todo comando documentado se ejecuta antes — los docs no mienten |
| `/memoria` | **Memoria** | Aprendizajes, trampas, decisiones y gustos que persisten entre sesiones |
| `/seguridad` | **CSO** | OWASP + STRIDE con gate de confianza ≥8/10: cero ruido, cada hallazgo con exploit concreto |
| `/guardian` | **Guardias** | Enciende/apaga las protecciones deterministas; congela ediciones a un directorio |
| `/legal` | **Asesor legal CO** | Derecho **laboral** en todos sus ámbitos (contratos, jornada, prestaciones, terminación e indemnizaciones, estabilidad reforzada, seguridad social), más datos personales (Ley 1581), delitos informáticos (Ley 1273), e-commerce (Ley 527/1480) y software como obra. Lee y analiza documentos (contratos, liquidaciones, cartas) y pregunta los hechos antes de asesorar. Cero adivinanza de cifras/normas: se verifican en fuente oficial. Calibración sé/creo/supongo obligatoria |

## Lo que la fábrica recuerda

- **Estado**: `.fabrica/sprint.json` — etapa, historial, pendientes.
- **Memoria por proyecto**: `.fabrica/memoria.jsonl`.
- **Memoria global**: `~/.repofibe/memoria.jsonl` — te sigue entre proyectos.
- En Claude Code, un hook SessionStart inyecta este contexto al abrir la
  sesión: la fábrica nunca empieza de cero.

## Calidad del propio repo

```bash
node evals/validar.mjs   # tier 1: gratis, <5s, corre en cada push
node evals/tier2.mjs     # tier 2: E2E, sesión de sprint completa simulada
```

Tier 1 valida frontmatter y convenciones de las 32 skills, manifiestos,
hooks — y ejecuta de verdad `estado`, `memoria`, `guardia`, `grafo`,
`secretos`, `salud` y `navegador` contra directorios temporales (incluidos
los casos "rm -rf → ask", "--force-with-lease → silencio", "edición fuera
del congelado → deny", y detección de prompt-injection con Chromium real
cuando Playwright está instalado). Tier 2 encadena una sesión de sprint
completa (pensar→retro, ~15 subprocesos reales) verificando que el estado
fluye correctamente entre `estado.mjs`, `checkpoint.mjs`, `grafo.mjs` y
`pruebas.mjs` — el tipo de bug de integración que tests aislados no
atrapan. Ambos corren como jobs separados en CI (`.github/workflows/evals.yml`).

## Hoja de ruta

- **v0.4** — `/design-shotgun` (variantes + tablero + taste memory).
- **v0.5** — `/pair-agent`, embeddings/búsqueda semántica.

Seguimiento detallado contra gstack: [docs/COMPARACION-GSTACK.md](docs/COMPARACION-GSTACK.md).

## Filosofía

Nueve principios en [FILOSOFIA.md](FILOSOFIA.md) — evidencia antes de
afirmación, causa raíz antes de parche, el harness sobre el prompt, hervir el
lago, buscar antes de construir, soberanía del usuario, iterar hasta que
quede mejor, y el contexto como recurso finito. El protocolo operativo que
cada skill carga: [plantillas/razonamiento-fable.md](plantillas/razonamiento-fable.md).

## Licencia

MIT. Libre para siempre. Ve y construye algo.
