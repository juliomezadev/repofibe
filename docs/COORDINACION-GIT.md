# Coordinación Git con agentes aislados

`nucleo/agentes-git.mjs` prepara ramas y `git worktree` por agente a partir de
una base revisada. Comprueba ownership, detecta divergencias y aplica los
parches en un worktree de integración nuevo. No cambia el árbol coordinador ni
la rama base. Los cambios integrados quedan staged y sin commit para revisión.

## Alcance y límites

Este mecanismo controla las operaciones Git que ejecuta su propia CLI. No
confina procesos de agentes ni otros comandos; un agente aún podría escribir
fuera de su worktree usando una herramienta ajena al protocolo. Los agentes
deben recibir el path del worktree asignado y no el del coordinador. Las
pruebas ejecutadas se consideran confiables: `spawnSync` las inicia sin shell y
con `cwd` en el worktree de integración, pero Node no las sandboxea y podrían
acceder a otras rutas. Use el mecanismo primero en repositorios sintéticos y
solo amplíe su uso con un scope expresamente autorizado.

La integración no hace `merge`, `reset`, `clean`, checkout, push ni commit. Usa
`git apply --3way --index` en un worktree recién creado. No elimina worktrees,
ramas, manifiestos ni resultados parciales. Si hay conflicto o cambia el estado
durante la operación, deja el material disponible para inspección. Un intento
fallido se recupera mediante un `runId` nuevo y otro directorio vacío; la
limpieza de runs previos queda a cargo del usuario.

## Contrato de entrada

Prepare un archivo JSON fuera del árbol del repo, pero dentro de un directorio
de scope que contenga tanto el repo sintético como una carpeta `worktrees` ya
creada y vacía. `expectedHead` debe ser el SHA completo de `HEAD`. La rama
coordinadora debe estar activa y limpia.

```json
{
  "scopeRoot": "C:/temp/repofibe-pilot",
  "repo": "C:/temp/repofibe-pilot/repo",
  "worktreeRoot": "C:/temp/repofibe-pilot/worktrees",
  "baseBranch": "main",
  "coordinatorBranch": "main",
  "expectedHead": "<SHA completo>",
  "runId": "piloto-01",
  "contracts": ["src/shared/schema.json"],
  "agents": [
    { "id": "api", "paths": ["src/api/"] },
    { "id": "docs", "paths": ["docs/"] }
  ],
  "tests": [
    { "program": "C:/ruta/node.exe", "args": ["--test", "tests/smoke.mjs"] }
  ]
}
```

Las rutas de ownership son relativas, usan `/` y son literales: `src/a.mjs`
asigna un archivo; `src/api/` asigna un árbol. Rutas iguales o anidadas entre
agentes se rechazan. `contracts` y los archivos Git `.gitattributes` y
`.gitmodules` son de solo lectura durante esta integración.
Symlinks y submódulos quedan fuera de la integración automática. Las pruebas
son argv (ejecutable más argumentos), nunca una cadena de shell; en Windows
use un ejecutable real como `node.exe`, no un `.cmd`.

## Procedimiento

Desde cualquier directorio, ejecute el archivo de la distribución de REPOFIBE:

```powershell
node C:\ruta\repofibe\nucleo\agentes-git.mjs preparar C:\temp\repofibe-pilot\plan.json
node C:\ruta\repofibe\nucleo\agentes-git.mjs validar C:\temp\repofibe-pilot\worktrees\coordinacion-piloto-01.json
node C:\ruta\repofibe\nucleo\agentes-git.mjs integrar C:\temp\repofibe-pilot\worktrees\coordinacion-piloto-01.json
```

`preparar` exige repo y worktree root existentes, repositorio base limpio,
`HEAD`/rama coincidentes con el plan, rutas de destino inexistentes, ramas no
usadas y ownership disjunto. Crea una rama/worktree de integración y una rama/
worktree por agente desde el mismo SHA. Usa nombres `repofibe/<runId>/...` y
deshabilita hooks Git en las operaciones propias de la CLI.

Cada agente trabaja y confirma sus cambios en su branch asignado. `validar`
requiere worktrees limpios y cambios ya confirmados; verifica descendencia de
la base, ownership, contratos, symlinks/submódulos, rutas compartidas entre
agentes, rama base y worktree de integración. Un archivo repetido entre agentes
se considera conflicto, aunque sus ediciones pudieran combinarse.

`integrar` repite las verificaciones antes de aplicar cada parche y comprueba
el estado del worktree tras cada aplicación. Ejecuta la suite indicada después
de integrar. Si Git detecta conflicto real al aplicar, o alguna prueba falla,
preserva el worktree, branches y archivos y registra el error en el manifiesto.
No intenta abortar o deshacer una operación en curso.

## Evidencia y recuperación

El JSON `coordinacion-<runId>.json` conserva SHA base, ownership, branches,
worktrees, archivos cambiados, pruebas, estado final y argv/cwd/código/tiempo de
cada operación iniciada por la CLI. Los errores también devuelven evidencia en
JSON por stdout y código de proceso distinto de cero. La evidencia no contiene
el contenido de los parches.

Estados habituales: `preparada`, `validada`, `integrada-validada`, `bloqueada`,
`conflicto-conservado` y `tests-fallidos-conservados`. En caso de bloqueo,
inspeccione el manifiesto, `git status` y las dos ramas implicadas. La herramienta
no descarta ni corrige cambios por su cuenta. Para continuar, revise la base,
ajuste el contrato o resuelva el conflicto fuera del run preservado y prepare
un `runId` nuevo con una carpeta vacía. No reutilice el worktree fallido como
destino y no borre su evidencia antes de decidir cómo conservarla.

## Verificación local

El harness `evals/nucleo/agentes-git.mjs` crea repositorios temporales Windows
y comprueba ownership solapado, escritura fuera del contrato, dos agentes sobre
el mismo archivo, avance concurrente de la base, drift concurrente del destino,
integración de rutas independientes, ejecución de pruebas y recuperación en
otro worktree. No usa repos productivos ni requiere red. Los directorios del
harness se conservan bajo `%TEMP%` para inspección.
