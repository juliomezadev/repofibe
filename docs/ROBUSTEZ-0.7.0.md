# Preparación de robustez 0.7.0

Esta nota describe el candidato de robustez 0.7.0. No equivale a una
publicación ni a una certificación de que todas las celdas de CI hayan pasado.
La fuente de verdad para la instalación, los recibos y el rollback es el código
de esta rama.

## Alcance de la versión 0.7.0

Windows x64 es la plataforma objetivo de esta versión. El equipo de referencia
es Windows 10 Enterprise LTSC x64; Node.js 22.23.4 y 24.22.1 son las versiones
de seguridad comprobadas en este sistema. Los requisitos de aceptación y los
pasos de instalación, actualización y recuperación están en
[RELEASE-WINDOWS-0.7.0.md](RELEASE-WINDOWS-0.7.0.md). Esta definición no cierra
el gate original multiplataforma: Linux y macOS siguen pendientes, y los casos
de symlink de archivo que Windows bloquea se mantienen parciales.

## Runtime y pruebas de navegador

Los instaladores exigen Node.js 22 o superior y recomiendan Node.js 24. El
checkout fija Playwright `1.64.1` como dependencia de desarrollo; el núcleo no
lo requiere para operaciones que no usan navegador. Para QA con Chromium:

```bash
npm ci
npm run setup:chromium
```

Estos dos comandos se ejecutaron desde un checkout temporal en Node.js
`24.15.0`; Playwright instaló Chromium y sus componentes auxiliares dentro de
una carpeta de caché temporal. No se instaló nada en el perfil global.

El workflow de evals define dos trabajos: Tier 1 prepara npm y Chromium antes
de validar; Tier 2 ejecuta las suites E2E sin instalar el navegador. Ambos
usan Ubuntu y Windows con Node 22 y 24, más macOS con Node 24. macOS con Node
22 está excluido. La definición de una matriz no prueba que una corrida remota
haya terminado en verde.

Tier 2 incluye una prueba determinista del ciclo de sprint y una suite que
invoca cinco skills con un modelo. La segunda requiere `ANTHROPIC_API_KEY` y
puede generar costo; el workflow no la configura, por lo que aparece como
`OMITIDA` en CI y no se cuenta como aprobada. Algunas evals crean symlinks o
junctions para comprobar confinamiento. Si el sistema operativo o los
permisos no permiten crear el fixture, la eval lo informa como omitido: ese
caso queda pendiente en esa plataforma.

## Distribución y estado del plugin

La distribución genera un manifiesto con versión, commit y SHA-256 de los
archivos permitidos. El instalador lo usa para detectar archivos faltantes o
alterados; un hash acredita coincidencia de bytes con el manifiesto disponible,
no la identidad del autor ni una firma del artefacto.

Para Claude Code, el instalador consulta marketplaces y plugins usando la
salida JSON de su CLI. Si la respuesta es desconocida, el estado preexistente
entra en conflicto o la instalación nativa falla, conserva lo que no puede
atribuirse con seguridad y pasa a copias de skills con hooks registrados en
`~/.claude/settings.json`. Si el plugin queda registrado, el diagnóstico usa
`registrado_no_verificado`: no puede comprobar que el host lo haya cargado. El
flujo de evaluación usa una CLI simulada; no reemplaza una comprobación con la
versión real de Claude Code que vaya a usar cada persona.

El instalador evita retirar un marketplace preexistente o uno del que dependan
otros plugins. Ante un fallo, intenta desinstalar el plugin de repofibe y sólo
retirar un marketplace que haya confirmado como creado en esa ejecución,
después de confirmar que no quedan plugins asociados. Si la CLI no confirma el
estado final, el instalador informa que la compensación quedó incompleta; no
debe asumirse que el estado externo se restauró automáticamente.

## Registro de instalación y recibos de ejecución

El registro local de instalación está en `~/.repofibe/instalado.json`. Su
versión de esquema actual es 2. No es un recibo firmado: es el inventario que
el instalador usa para reconocer sus archivos, bloques y destinos durante un
refresco o una desinstalación. Sus campos son:

| Campo | Semántica implementada |
|---|---|
| `version` | Versión del esquema del registro (`2`), no la versión de Repofibe. |
| `distribucion` | Identidad de la copia compartida: `version` y `commit` del manifiesto instalado. |
| `rutas` | Rutas absolutas de las raíces donde se registró contenido de Repofibe, incluida la aplicación compartida y las carpetas de skills. |
| `archivos` | Entradas `{ ruta, sha256 }` por archivo regular registrado. El hash se compara con el contenido actual para decidir si el instalador puede actualizar o retirar ese archivo sin pisar una edición posterior. |
| `bloques` | Rutas de archivos con contenido gestionado, como reglas marcadas de `AGENTS.md` o `settings.json` al registrar hooks. |
| `bloquesPropios` | Entradas `{ ruta, sha256, creado }`: hash del bloque marcado o, para `settings.json`, del JSON serializado completo cuando se registraron los hooks; `creado` indica si el archivo de destino no existía al registrarlo. Al ejecutar `--quitar`, los hooks se retiran comparando los comandos gestionados de `PreToolUse`/`SessionStart` y el comando heredado exacto de `PostToolUse`; el hash JSON no se usa para seleccionar qué hooks retirar. Para otros bloques marcados, se conserva contenido ajeno y sólo se retiran si su hash coincide. |
| `directorios` | Directorios creados durante la instalación; al desinstalar sólo se quitan si siguen vacíos. |
| `destinos` | Raíces de skills instaladas, usadas para localizar destinos durante `--refrescar`. |
| `plugins` | Identificadores de plugin anotados en el registro. `repofibe` significa que el instalador lo registró; no demuestra que Claude Code lo haya cargado. |

Las rutas son locales al equipo y pueden revelar su estructura. Los hashes
sirven para comparar bytes; no autentican el origen ni protegen el JSON de una
edición manual. La lista refleja el registro del instalador, no una inspección
independiente de cada host.

Los recibos del runner de gates viven en `.fabrica/ejecuciones/` y son un
contrato distinto del registro de instalación. Cada ejecución escribe
`run-<uuid>.json` y los archivos `run-<uuid>.stdout.log` y
`run-<uuid>.stderr.log`. El recibo v1 contiene estos campos:

| Campo | Semántica implementada |
|---|---|
| `version`, `runnerVersion` | Versiones del contrato del recibo (`1`) y del runner (`repofibe-ejecuciones/1`). |
| `runId` | Identificador aleatorio `run-<uuid>` compartido por el recibo y los logs. |
| `gateId` | Identificador del gate solicitado por el descriptor de prueba. |
| `comando` | Texto del ejecutable tal como llegó en el descriptor; no lo redacta el runner. |
| `argsSha256` | SHA-256 de la serialización JSON de los argumentos originales. No permite reconstruirlos directamente, pero valores adivinables se pueden comparar por fuerza bruta. |
| `argsRedactados` | Representación para inspección: argumentos que parecen flags (`-x` o `--nombre`) quedan visibles; los demás se sustituyen por `<REDACTADO:n bytes>`. No es una copia ejecutable de los argumentos. |
| `workspaceId` | SHA-256 de la ruta absoluta resuelta del workspace, normalizada a barras `/` y minúsculas. Identifica esa ruta local, no una persona o repositorio global. |
| `commit` | `HEAD` de Git al tomar la huella anterior a ejecutar el comando. |
| `fuentesFingerprint`, `fuentes` | Huella SHA-256 agregada y lista de `{ ruta, sha256 }` observada antes del comando. Incluye todos los archivos rastreados y los no rastreados con extensiones configuradas o nombres de configuración; omite rutas que empiezan por `.fabrica/` o `.git/` y rutas que contienen `/node_modules/`. Un enlace se resume como `SYMLINK:<destino>` y una ruta ilegible o ausente como `MISSING:<error.code>` (o `MISSING:unknown` si no hay código) antes de calcular su hash. |
| `iniciado`, `finalizado` | Tiempos ISO-8601 de inicio y fin de la ejecución. |
| `exitCode` | Código de salida del proceso cuando `status` es entero. Si no lo es, el runner usa `124` cuando `error.code` es `ETIMEDOUT` y `127` en los demás casos, incluidas terminaciones sin estado numérico (por ejemplo, por señal) y otros errores. |
| `fuentesEstables` | `true` si `HEAD` y la huella de fuentes son iguales antes y después del comando. |
| `hashesSalida` | SHA-256 de los textos guardados para `stdout` y `stderr`, después del redactor. |
| `logs` | Para cada stream: ruta relativa, SHA-256, `redactado: true` y `hallazgos` (`tipo` y cantidad de patrones sustituidos). |

La evidencia de gate enlaza al recibo mediante `ejecucionRef` (`runId`,
`sha256Recibo` y `argsSha256`). Al verificar una prueba observada, Repofibe
comprueba esa referencia y el hash del JSON; versión, gate, comando, código de
salida y timestamp; que las fuentes permanezcan estables y coincidan con el
commit/fingerprint actuales; y que ambos logs existan en las rutas esperadas y
conserven sus hashes. No vuelve a ejecutar el comando. El recibo y sus logs
deben permanecer junto al workspace para que la verificación local funcione.
El sync de Repofibe sólo transporta memoria y notas de dominio; no incluye
estos recibos.

| Garantía implementada | Límite que permanece |
|---|---|
| Rechaza guardar recibos y logs en symlinks o fuera del workspace. | No crea un sandbox de sistema operativo: el comando hereda el entorno del proceso y puede acceder a los permisos que tenga ese usuario. |
| Vincula evidencia con gate, comando, argumentos, commit, fuentes y logs por hashes. | Los recibos no están firmados. Quien pueda escribir el workspace puede reemplazar recibo, logs y evidencia y recalcular sus hashes. |
| Persiste stdout/stderr tras aplicar el redactor de secretos y no conserva valores completos de argumentos no reconocidos como flags. | El redactor detecta patrones conocidos; un secreto con formato no reconocido puede sobrevivir. |
| Rechaza algunos comandos de publicación explícitos (`git push`, `npm publish`, `pnpm publish`, `yarn publish`, `gh release create`). | Es una defensa contra errores evidentes, no una lista completa de comandos peligrosos ni una política de aislamiento. |
| La verificación falla si el código fuente ya no coincide con el commit y fingerprint del recibo. | El recibo aporta trazabilidad local del estado observado, no una atestación independiente ni prueba quién lanzó el comando. |

Usa el registro de instalación para entender qué rutas cree poseer el
instalador y los recibos de gates para revisar ejecuciones locales vinculadas
a una revisión concreta. Ninguno es una bitácora inmutable, evidencia legal,
firma de autoría ni garantía contra un proceso con permisos de escritura.
El redactor sólo detecta patrones conocidos y los argumentos originales no se
guardan en claro, pero el comando, los nombres de flags, la longitud de valores
y el hash de argumentos sí quedan en el recibo.

## Rollback y riesgos de plataforma

El instalador registra los bytes previos de sus archivos y configuración. Si
una operación local falla, intenta restaurarlos sólo cuando todavía reconoce
las rutas como archivos regulares y no ve cambios concurrentes. Puede omitir
una restauración si la ruta cambió, pasó a ser un enlace o tiene padres
inseguros; el resultado informa esa limitación en vez de pisar cambios ajenos.

Las operaciones de la CLI de Claude son efectos externos y no forman una
transacción atómica con el sistema de archivos. Una actualización puede haber
refrescado ya la aplicación local cuando falla `claude plugin update`; en ese
caso se conserva la app actualizada y se pide reintentar. La compensación de
instalación intenta revertir únicamente efectos nativos atribuidos a la
ejecución actual y puede fallar por causas externas. El comando de quitar
desinstala el plugin registrado cuando puede, pero no elimina el marketplace
del usuario.

La instalación usa copias de archivos y no depende de symlinks. Aun así, las
pruebas que crean symlinks/junctions tienen requisitos propios del sistema
operativo: su omisión en Windows no demuestra el camino de escape ni lo
descarta. La matriz configurada cubre tres sistemas, pero sólo los resultados
reales de una corrida limpia acreditan cada combinación. La suite con LLM queda
fuera de esa cobertura mientras no se ejecute explícitamente con credenciales
y presupuesto.

### Si el rollback informa que quedó incompleto

El instalador no ofrece un comando de reparación ni conserva una copia de
respaldo general de los archivos previos. Las advertencias de rollback
identifican las rutas o archivos cuya restauración se omitió o falló; la
compensación externa de Claude puede reportar por separado una falla en
`plugin uninstall` o `marketplace remove`. La limpieza de directorios es
distinta: algunas excepciones en ese paso se capturan sin imprimir aviso, por
lo que la ausencia de advertencias no prueba que todos quedaran limpios. No
supongas que el estado volvió al punto inicial ni borres esas rutas para
forzar una reinstalación.

1. Conserva la salida completa del instalador y anota cada ruta, motivo y
   error de compensación impreso.
2. Desde la aplicación instalada, consulta el diagnóstico de sólo lectura:

   ```bash
   cd ~/.repofibe/app
   node nucleo/diagnostico.mjs --host claude --json
   ```

   Omite `--host claude` si Claude Code no forma parte de la instalación. El
   diagnóstico informa `en_actualizacion` si sigue presente
   `~/.repofibe/en-actualizacion.json`; no elimina ese marcador ni repara
   archivos. Si el marcador permanece después de que el instalador haya
   terminado, confirma primero que no haya otra actualización ejecutándose y
   reconcilia manualmente el estado antes de retirarlo. El marcador sólo
   contiene la versión, commit y hora de inicio; no contiene copias previas.
3. Para cada ruta local indicada, inspecciona el tipo de archivo y sus bytes.
   Compara con la versión deseada del manifiesto o con una copia previa que
   controles. Si la ruta cambió, es un enlace o su padre es inseguro, decide
   explícitamente qué conservar y corrige esa condición; el instalador omitió
   la restauración precisamente para no pisarla. No hay datos suficientes en
   el registro para reconstruir automáticamente el contenido anterior.
4. Si el error nombra el plugin o marketplace de Claude, consulta el estado
   actual con `claude plugin list --json` y
   `claude plugin marketplace list --json`. Desinstala o retira algo sólo
   después de confirmar que pertenece a esta operación y que ningún otro
   plugin depende del marketplace. Un marketplace preexistente o compartido
   se conserva.
5. Vuelve a ejecutar el diagnóstico. Sólo cuando el estado observado sea el
   que buscas, continúa con la operación que pretendías. Si el único fallo
   fue que la aplicación local ya se actualizó pero la CLI no pudo ejecutar
   `claude plugin update`, el mensaje del instalador indica reintentar
   `node nucleo/instalar.mjs --refrescar`; ese reintento no revierte la
   aplicación a la versión anterior.

## Cobertura Diataxis de esta nota

| Área | Tutorial | Cómo hacer | Referencia | Explicación |
|---|---|---|---|---|
| Instalación de navegador | Parcial, en README | Comandos `npm ci` y Chromium | Versiones y matriz CI | Runtime sin dependencia de navegador |
| Registro de instalación | — | Interpretar ownership antes de refrescar/quitar | Campos v2 | Hashes locales, no firma ni prueba de activación |
| Recibos de gates | — | Revisar y verificar evidencia local | Campos v1 y vínculo con evidencia | Modelo de integridad y amenazas |
| Plugin y rollback | Instalación básica, en README | Pasos manuales tras rollback incompleto | Estados y límites | Compensación local frente a efectos externos |

Queda pendiente un tutorial guiado de instalación y recuperación de principio
a fin. La referencia describe los campos observados en la implementación de
0.7.0; no convierte el registro ni el formato local de recibo en interfaces
estables o portables entre equipos.
