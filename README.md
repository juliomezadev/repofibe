# repofibe — La Fábrica

**Tu equipo de ingeniería virtual, en español.** Un CEO que reta el alcance,
un eng manager que firma la arquitectura, una diseñadora que caza el AI slop,
un staff engineer que encuentra los bugs que CI no ve, un QA con ojos, un CSO
sin ruido y un release engineer que shipea el PR. Catorce especialistas que
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
dependencias npm, cero binarios compilados.

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
| `/plan-ceo` | **CEO fundador** | Reta premisas, busca el producto de 10 estrellas. Modos: expansión / selectiva / mantener / reducción |
| `/plan-ing` | **Eng manager** | Flujo de datos ASCII, estados, casos borde, matriz de pruebas, modos de fallo. Veredicto: FIRMADO o DEVUELTO |
| `/plan-diseno` | **Diseñadora senior** | Seis dimensiones 0-10 con "cómo se ve un 10". Detector de AI slop |
| `/diseno` | **Design partner** | Entrevista + 3-5 referentes reales del catálogo awesome-design-md (lectura quirúrgica, jamás entero) → sistema de diseño derivado del producto con tokens concretos y prohibiciones anti-slop |
| `/autoplan` | **Pipeline** | Las tres revisiones en un comando: auto-decide lo objetivo (6 principios, marcados en el plan), pregunta solo el gusto |
| `/construir` | **Implementador** | Ejecuta el plan firmado: test primero, checkpoints atómicos, cero ediciones ortogonales |
| `/revisar` | **Staff engineer** | Siete cazadores de bugs de producción. Auto-corrige lo obvio, pregunta lo riesgoso |
| `/investigar` | **Debugger** | Ley de Hierro: sin fix antes de causa raíz demostrada. Freno a los 3 intentos fallidos |
| `/qa` | **QA con ojos** | Ejecuta la app de verdad (navegador/CLI/API), corrige, y cada fix trae test de regresión. `/qa solo-reporte` no toca código |
| `/shipear` | **Release engineer** | Base al día, suite, cobertura, versión, changelog, docs, PR |
| `/retro` | **Eng manager** | Datos reales de la semana → UNA mejora accionable |
| `/docs` | **Technical writer** | Diataxis en dos modos: actualizar drift tras shipear / generar desde cero. Todo comando documentado se ejecuta antes — los docs no mienten |
| `/memoria` | **Memoria** | Aprendizajes, trampas, decisiones y gustos que persisten entre sesiones |
| `/seguridad` | **CSO** | OWASP + STRIDE con gate de confianza ≥8/10: cero ruido, cada hallazgo con exploit concreto |
| `/guardian` | **Guardias** | Enciende/apaga las protecciones deterministas; congela ediciones a un directorio |
| `/legal` | **Asesor legal CO** | Razonamiento en derecho colombiano para builders: datos personales (Ley 1581, SIC), delitos informáticos (Ley 1273), e-commerce (Ley 527, Ley 1480), software como obra. Se integra con plugins legales del host. Calibración sé/creo/supongo obligatoria |

## Lo que la fábrica recuerda

- **Estado**: `.fabrica/sprint.json` — etapa, historial, pendientes.
- **Memoria por proyecto**: `.fabrica/memoria.jsonl`.
- **Memoria global**: `~/.repofibe/memoria.jsonl` — te sigue entre proyectos.
- En Claude Code, un hook SessionStart inyecta este contexto al abrir la
  sesión: la fábrica nunca empieza de cero.

## Calidad del propio repo

```bash
node evals/validar.mjs
```

Tier 1, gratis, <5 segundos: valida frontmatter y convenciones de las 14
skills, manifiestos, hooks — y ejecuta de verdad `estado`, `memoria` y
`guardia` contra un directorio temporal (incluidos los casos "rm -rf → ask",
"--force-with-lease → silencio" y "edición fuera del congelado → deny").

## Hoja de ruta

- **v0.2** — navegador propio con daemon persistente para `/qa`,
  evals tier 2 (E2E), modo checkpoint continuo.
- **v0.3** — skills de diseño generativo, `/docs` (Diataxis), segunda
  opinión cross-modelo, evals tier 3 (LLM-juez).
- **v0.4** — canary post-deploy, benchmark de rendimiento, memoria
  compartida entre máquinas.

Seguimiento detallado contra gstack: [docs/COMPARACION-GSTACK.md](docs/COMPARACION-GSTACK.md).

## Filosofía

Nueve principios en [FILOSOFIA.md](FILOSOFIA.md) — evidencia antes de
afirmación, causa raíz antes de parche, el harness sobre el prompt, hervir el
lago, buscar antes de construir, soberanía del usuario, iterar hasta que
quede mejor, y el contexto como recurso finito. El protocolo operativo que
cada skill carga: [plantillas/razonamiento-fable.md](plantillas/razonamiento-fable.md).

## Licencia

MIT. Libre para siempre. Ve y construye algo.
