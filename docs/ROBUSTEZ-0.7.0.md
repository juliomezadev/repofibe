# Preparación de robustez 0.7.0

Esta nota describe el candidato de robustez 0.7.0. No equivale a una
publicación ni a una certificación de que todas las celdas de CI hayan pasado.
La fuente de verdad para la instalación, los recibos y el rollback es el código
de esta rama.

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

## Alcance de los recibos de pruebas

Los recibos del runner de gates viven en `.fabrica/ejecuciones/`. Incluyen la
identidad del workspace, commit, fingerprint de fuentes observadas, gate,
comando, hash de argumentos, salida del proceso y referencias a logs
redactados. La evidencia guarda el identificador y el SHA-256 del recibo. Al
verificarla, Repofibe vuelve a comprobar el recibo, los logs y la huella actual
del workspace. El sync de Repofibe sólo transporta memoria y notas de dominio;
no incluye esos recibos.

| Garantía implementada | Límite que permanece |
|---|---|
| Rechaza guardar recibos y logs en symlinks o fuera del workspace. | No crea un sandbox de sistema operativo: el comando hereda el entorno del proceso y puede acceder a los permisos que tenga ese usuario. |
| Vincula evidencia con gate, comando, argumentos, commit, fuentes y logs por hashes. | Los recibos no están firmados. Quien pueda escribir el workspace puede reemplazar recibo, logs y evidencia y recalcular sus hashes. |
| Persiste stdout/stderr tras aplicar el redactor de secretos y no conserva valores completos de argumentos no reconocidos como flags. | El redactor detecta patrones conocidos; un secreto con formato no reconocido puede sobrevivir. |
| Rechaza algunos comandos de publicación explícitos (`git push`, `npm publish`, `pnpm publish`, `yarn publish`, `gh release create`). | Es una defensa contra errores evidentes, no una lista completa de comandos peligrosos ni una política de aislamiento. |
| La verificación falla si el código fuente ya no coincide con el commit y fingerprint del recibo. | El recibo aporta trazabilidad local del estado observado, no una atestación independiente ni prueba quién lanzó el comando. |

Usa estos recibos para revisar ejecuciones locales vinculadas a una revisión
concreta. No los uses como bitácora inmutable, evidencia legal ni garantía
contra un proceso malicioso con permisos de escritura.

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

## Cobertura Diataxis de esta nota

| Área | Tutorial | Cómo hacer | Referencia | Explicación |
|---|---|---|---|---|
| Instalación de navegador | Parcial, en README | Comandos `npm ci` y Chromium | Versiones y matriz CI | Runtime sin dependencia de navegador |
| Recibos de gates | — | Revisar límites antes de confiar | Contenido y verificación | Modelo de integridad y amenazas |
| Plugin y rollback | Instalación básica, en README | Diagnóstico y recuperación, parcial | Estados y límites | Compensación local frente a efectos externos |

Siguen faltando un tutorial de recuperación ante rollback incompleto y una
referencia exhaustiva de todos los campos del recibo. Ninguno es necesario
para entender los límites documentados aquí; pueden añadirse cuando la CLI de
gates se convierta en una interfaz estable para usuarios finales.
