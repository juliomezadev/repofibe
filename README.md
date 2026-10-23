# repofibe — La Fábrica

**Tu equipo de ingeniería virtual, en español.** Un CEO que reta el alcance,
un eng manager que firma la arquitectura, una diseñadora que caza el AI slop,
un staff engineer que encuentra los bugs que CI no ve, un QA con ojos, un CSO
sin ruido y un release engineer que shipea el PR. 33 especialistas que
trabajan como trabaja un buen equipo: con proceso, con estado y con memoria.

Inspirado en [gstack](https://github.com/garrytan/gstack) de Garry Tan —
y rediseñado desde cero con una tesis distinta:

> **Cada garantía que pueda ser determinista, se baja al harness.**
> Un prompt puede olvidarse; un hook bloquea una llamada solo si está habilitado,
> confiado y la herramienta pasa por una ruta que el host soporta.

## Las cinco diferencias estructurales

| | gstack | repofibe |
|---|---|---|
| **Instalación** | git clone + symlinks + editar CLAUDE.md (los symlinks se rompen en Windows) | Plugin nativo de Claude Code / copias planas sin requisito de symlinks |
| **Guardias** | `/careful` es un prompt | Claude Code usa hooks al habilitarlos. Codex puede usar el plugin local con `PreToolUse`, después de instalarlo y confiarlo; cubre rutas documentadas y no es un sandbox universal. |
| **Estado del sprint** | Implícito en documentos sueltos | `.fabrica/sprint.json` explícito: etapa, historial, pendientes. Cualquier sesión retoma donde quedó |
| **Docs de skills** | Plantillas + build step (drift si no rebuildeas) | Sin codegen: un SKILL.md por skill, bloques compartidos leídos en runtime |
| **Multi-host** | 10 hosts vía setup TypeScript | Estándar Agent Skills puro: Claude Code, Antigravity, Codex, Cursor, OpenCode y cualquier IDE que lo adopte |

Todo en español: skills, mensajes, docs, commits.

## Instalación

La guía de Windows x64 de 0.7.0 está en
[RELEASE-WINDOWS-0.7.0.md](docs/RELEASE-WINDOWS-0.7.0.md). Los cambios
de esta beta y sus límites se describen en
[RELEASE-WINDOWS-0.7.1-BETA.md](docs/RELEASE-WINDOWS-0.7.1-BETA.md).
Linux y macOS siguen pendientes de certificación.

**Requisitos del paquete ZIP para Windows:** Windows x64 y
[Node.js](https://nodejs.org) 22 o superior (24 recomendado); Git no es
necesario. Para clonar y ejecutar desde el repositorio también se necesita
Git. El núcleo no tiene dependencias runtime externas. Las pruebas de
navegador requieren npm, Playwright `1.64.1` —fijado como dependencia de
desarrollo— y Chromium.

> **Nota de honestidad:** algunas capacidades avanzadas usan herramientas
> Playwright se importa dinámicamente para navegador/QA/scrape (`/qa`,
> `/scrape`, `/design-review`, `/autenticar`), pero queda declarado como
> dependencia de desarrollo para que el checkout sea reproducible. La búsqueda
> semántica de memoria (`@xenova/transformers`) y el CLI de un LLM
> (`claude`/`gemini`) siguen siendo capacidades opcionales externas.

Desde un checkout limpio, instala las dependencias y prepara únicamente
Chromium:

```bash
npm ci
npm run setup:chromium
```

```powershell
# Windows
git clone https://github.com/juliomezadev/repofibe.git
cd repofibe; .\instalar.ps1
```

```bash
# macOS / Linux / WSL
git clone https://github.com/juliomezadev/repofibe.git
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

### Hooks deterministas

Los hooks no se cargan con solo copiar las skills. En Claude Code, el instalador
registra las guardias compatibles con ese host. En Codex, el hook `PreToolUse`
está dentro del plugin local `.codex-plugin`; hay que instalar el plugin en
Codex y revisar/confiar su definición para que pueda ejecutarse. El hook puede
denegar acciones sobre rutas soportadas, pero una herramienta especializada,
un hook sin confianza o un error del propio hook pueden quedar fuera de esa
barrera. Consulta [GUARDIA-CODEX.md](docs/GUARDIA-CODEX.md).

```bash
node nucleo/instalar.mjs --hooks   # actívalos y reinicia Claude Code
```

Es idempotente y seguro: registra los hooks en `~/.claude/settings.json`
respetando tu configuración y la de otros plugins, respalda tu archivo original
en `settings.json.bak-repofibe` y no toca nada si el JSON está corrupto.

En Claude Code, el instalador intenta registrar el marketplace local e instalar
el plugin nativo en el ámbito del usuario. Si la CLI no ofrece el JSON esperado,
el estado entra en conflicto o la instalación falla, usa copias planas y
registra los hooks en `~/.claude/settings.json`. Puedes pedir sólo esa
activación con `node nucleo/instalar.mjs --hooks`.

Comprueba el resultado con `node nucleo/diagnostico.mjs`. En modo copia informa
si ambos hooks aparecen en `settings.json`; en modo plugin puede informar
`registrado_no_verificado`: el registro del plugin no demuestra que Claude Code
lo haya cargado. Reinicia Claude Code después de una instalación o cambio de
hooks y confirma su actividad desde el host.

> **Esto no es teórico.** En la instalación del propio autor, las 33 skills
> estaban puestas y los hooks llevaban versiones sin correr: el guardia
> determinista, la ventaja central del proyecto, estaba apagado en silencio
> porque el fallback a modo copia nunca se reintentaba. Corregido en v0.6.0,
> con eval que lo fija (`evals/seguridad/hooks-activados.mjs`).

## El ciclo del sprint

**pensar → planear → construir → revisar → probar → shipear → retro**

Las acciones registrables de las skills escriben su resultado en
`.fabrica/sprint.json`; las consultas puras no mutan el estado. La política
operativa está en `plantillas/contrato-cierre.json`.

| Skill | Especialista | Qué hace |
|---|---|---|
| `/fabrica` | **Orquestador** | Dashboard del sprint, detecta la etapa, encadena la siguiente skill. Empieza aquí |
| `/razonar` | **Razonamiento Fable** | El playbook profundo aplicado por escrito: descomposición por valor de información, alternativas con condición de arrepentimiento, pre-mortem, calibración sé/creo/supongo |
| `/complejo` | **Problemas muy complejos** | Cuaderno de razonamiento persistente entre sesiones, árbol de dependencias, la mayor incertidumbre primero (spikes), integración continua, subagentes en paralelo |
| `/ubicar` | **Sentido de orientación** | Localiza cualquier cosa en un repo sin leer de más: mapa estructural (`mapa.mjs`), hipótesis por convención, Grep dirigido, confirmación con `archivo:línea` |
| `/grafo` | **Grafo de código** | ¿Qué se rompe si toco X? (impacto transitivo), hubs críticos, deps — consultas de 20 líneas sin leer archivos. Consume grafos externos (graphify/NetworkX) con chequeo de frescura obligatorio |
| `/oficina` | **Socio de YC** | Seis preguntas forzadas que reencuadran el producto antes de escribir código. Produce el doc de diseño |
| `/spec` | **Autor de specs** | Intención vaga → spec ejecutable en 5 fases, con gate de calidad 7/10 y redacción de secretos |
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

## Telemetría local (qué se guarda y cómo apagarla)

La fábrica anota su propio uso en `.fabrica/traza.jsonl` para poder responder
con datos —y no con intuición— qué skills se usan, cuáles fallan y cuáles son
peso muerto.

```bash
node nucleo/traza.mjs ver 20            # últimos eventos + más frecuentes
node nucleo/traza.mjs inspeccionar <id> # árbol de una traza concreta
```

Qué se guarda, exactamente:

```jsonl
{"ts":1784963646117,"ev":"skill","n":"legal","d":"permitir"}
{"ts":1784963647349,"ev":"herramienta","n":"Bash","d":"ask"}
```

Marca de tiempo, tipo de evento, nombre de la herramienta o skill, y la
decisión del guardia. **Nada más.** No se guardan comandos, rutas de archivo,
argumentos ni prompts: un comando de shell puede llevar una credencial dentro
y esto escribe a disco. El filtro es una lista blanca en el código, no una
buena intención — `evals/nucleo/traza.mjs` lo verifica intentando colar un
secreto y comprobando que no llega al archivo.

- **Local y tuya.** `.fabrica/` está gitignorado y no sale de tu máquina.
  Cero telemetría remota, por diseño.
- **Se apaga** con `.fabrica/traza.json` → `{"activo": false}`.
- **Nunca estorba.** Si no puede escribir, falla en silencio; los hooks
  siguen funcionando igual (probado con la traza deliberadamente rota).

## Calidad del propio repo

```bash
npm ci
npm run setup:chromium
node evals/validar.mjs
node evals/tier2.mjs
```

El [workflow de CI](.github/workflows/evals.yml) ejecuta Tier 1 y Tier 2 por
separado. Tier 1 prepara Playwright y Chromium; Tier 2 no los necesita. La
matriz usa Ubuntu y Windows con Node 22 y 24, y macOS con Node 24 (macOS/Node
22 está excluido en el workflow actual).

Tier 1 valida frontmatter y convenciones de las 33 skills, manifiestos,
hooks — y ejecuta de verdad `estado`, `memoria`, `guardia`, `grafo`,
`secretos`, `salud` y `navegador` contra directorios temporales (incluidos
los casos "rm -rf → ask", "--force-with-lease → silencio", "edición fuera
del congelado → deny", y detección de prompt-injection con Chromium real
cuando están instalados Playwright y Chromium). Tier 2 encadena una sesión de sprint
completa (pensar→retro, ~15 subprocesos reales) verificando que el estado
fluye correctamente entre `estado.mjs`, `checkpoint.mjs`, `grafo.mjs` y
`pruebas.mjs` — el tipo de bug de integración que tests aislados no atrapan.
Tier 2 incluye además una suite de cinco skills juzgadas por un modelo; sin
`ANTHROPIC_API_KEY` esa suite queda `OMITIDA` y no cuenta como verificada ni
como PASS. El workflow no inyecta esa credencial, así que CI no ejecuta esa
evaluación de pago. Las evals que necesitan crear symlinks o junctions pueden
marcar ese caso como omitido si los permisos del sistema operativo lo impiden;
un caso omitido tampoco acredita cobertura. Consulta los límites de plataforma,
recibos y rollback en [Robustez 0.7.0](docs/ROBUSTEZ-0.7.0.md).
La evaluación propuesta de Harness² está separada del producto y no añade
dependencias: [diseño del experimento](docs/EXPERIMENTO-HARNESS2.md).

El estado persistido y la memoria contienen datos locales del usuario; las
sesiones `storageState` viven en `.fabrica/auth/` y no entran en sync. La
memoria histórica se trata como dato no confiable. `sync pull` propaga errores
de Git y distingue conflictos de éxito. El grafo se reutiliza sólo si
coinciden el commit y el fingerprint de sus fuentes; `salud` mide la respuesta
HTTP real antes de emitir un veredicto.
El escáner experimental de cadena de suministro auditado en Batch 4 no forma
parte del producto ni se cablea en `hooks/hooks.json`.

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
