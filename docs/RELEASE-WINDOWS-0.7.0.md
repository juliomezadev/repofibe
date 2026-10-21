# REPOFIBE 0.7.0 — paquete para Windows x64

Este es el alcance de plataforma de la versión 0.7.0. El paquete local todavía
no está publicado. G4 Windows se acepta sólo con la evidencia de la matriz
local descrita en el informe de release; G4 multiplataforma permanece abierto
hasta ejecutar sus checks obligatorios de CI y las pruebas POSIX/macOS.

## Criterios de aceptación para Windows

El alcance Windows de G4 se considera verificado cuando se cumplen estos
criterios en Windows x64:

1. El paquete identifica la versión y el commit, contiene los hashes de todos
   sus archivos y su manifiesto de distribución resulta `coherente`.
2. La extracción e instalación limpia funcionan con Node 22.23.4 y 24.22.1;
   el diagnóstico de la app instalada queda `coherente`.
3. Los flujos básicos instalados funcionan: estado de sprint, skills del host
   y hook de guardia ante una entrada permitida y una destructiva simulada.
4. Una actualización fallida restaura los bytes de la versión anterior, su
   manifiesto y registro; el marcador temporal desaparece y los datos del
   usuario conservan sus hashes. Al retirar la obstrucción, el refresco
   instala 0.7.0 y vuelve a pasar el diagnóstico.
5. `npm audit` no encuentra vulnerabilidades en las dos versiones de Node
   probadas.
6. No se elevan permisos ni se activa Developer Mode para crear symlinks. Si
   Windows devuelve `EPERM` al crear un symlink de archivo, el caso conserva
   estado parcial y se informa; una junction sirve como cobertura adicional
   de directorios, pero no se cuenta como certificación del symlink POSIX.

Estos criterios delimitan únicamente Windows x64. No cierran G4 en su alcance
multiplataforma: Linux/macOS y los checks obligatorios bloqueados de GitHub
siguen pendientes.

## Compatibilidad y requisitos

- Windows x64. Se validó en Windows 10 Enterprise LTSC x64, build 17763.
- Node.js x64 22 o posterior. Los parches probados para este release son
  22.23.4 (npm 10.9.9) y 24.22.1 (npm 11.19.1); ambos son security releases.
- PowerShell para ejecutar `instalar.ps1`. La instalación del paquete ZIP no
  requiere Git, npm install, derechos de administrador, symlinks ni Developer
  Mode. Node debe estar disponible en `PATH`.
- Para ejecutar pruebas de navegador del repositorio se requiere npm,
  Playwright 1.64.1 y Chromium. No son dependencias runtime de la instalación.

## Instalación

1. Extrae `Repofibe-0.7.0-windows-x64.zip` en una carpeta tuya.
2. Abre PowerShell en esa carpeta y elige el host. Por ejemplo, para Codex:

   ```powershell
   .\instalar.ps1 -RepoHost codex
   ```

   También se puede ejecutar directamente el instalador Node:

   ```powershell
   node .\nucleo\instalar.mjs --host codex
   ```

   Hosts admitidos por el instalador: `claude`, `antigravity`, `codex`,
   `cursor`, `opencode`, `generico` y `todos`. `generico` puede recibir
   `--workspace <ruta>` para colocar las skills en ese proyecto.
3. Comprueba la copia compartida instalada:

   ```powershell
   node "$env:USERPROFILE\.repofibe\app\nucleo\diagnostico.mjs" --json
   ```

El instalador escribe bajo el perfil del usuario actual. No necesita permisos
de administrador. Para `codex`, las skills quedan en
`%USERPROFILE%\.codex\skills`; la aplicación compartida queda en
`%USERPROFILE%\.repofibe\app`. El registro de ownership está en
`%USERPROFILE%\.repofibe\instalado.json`.

## Configuración y uso

Selecciona explícitamente el host cuando lo conozcas para evitar detección
ambigua. Si se elige `todos`, el instalador aplica las reglas de ownership y
conserva los archivos que no creó o que el usuario modificó. Los valores de
autenticación se guardan por proyecto bajo `.fabrica/auth`; la aplicación no
requiere un servicio remoto ni habilita telemetría remota.

Después de instalar, abre el host elegido y usa las skills `repofibe-*` que
quedaron en su carpeta de skills. El comando de diagnóstico anterior comprueba
la integridad de la aplicación compartida y el registro local.

## Actualización

Extrae la nueva versión en otra carpeta y ejecútala desde ahí:

```powershell
.\instalar.ps1 -Refrescar
```

El refresco reemplaza archivos que el registro reconoce como propiedad de
Repofibe. Conserva skills y configuración preexistentes o editadas por el
usuario. Si el diagnóstico final falla, la operación local intenta restaurar
los bytes anteriores y retirar el marcador de actualización.

## Recuperación y rollback

Conserva la salida completa de cualquier error. Ejecuta el diagnóstico:

```powershell
node "$env:USERPROFILE\.repofibe\app\nucleo\diagnostico.mjs" --json
```

Si el rollback termina correctamente, vuelve a ejecutar el paquete conocido
bueno con `-Refrescar` y comprueba el diagnóstico. Si aparecen advertencias de
`rollback omitido` o `rollback incompleto`, no borres rutas ni
`en-actualizacion.json` para forzar el estado. Inspecciona las rutas y los
bytes indicados y sigue la sección «Si el rollback informa que quedó
incompleto» de [ROBUSTEZ-0.7.0.md](ROBUSTEZ-0.7.0.md). El rollback evita pisar
cambios concurrentes y no puede revertir de forma atómica operaciones externas
de la CLI nativa de Claude Code.

## Pruebas y límites conocidos

- El manifiesto del paquete contiene SHA-256 por archivo y liga versión y
  commit. Detecta diferencias respecto del manifiesto incluido; no es una firma
  criptográfica ni prueba la identidad del publicador.
- Windows bloqueó la creación de symlink de archivo con `EPERM` en las dos
  pruebas afectadas. La suite conserva esos subcasos como parciales. La prueba
  recursiva usa además una junction de directorio cuando Windows lo permite,
  y `auth-rutas` verifica el rechazo de una junction que sale de la raíz. Esto
  no certifica el caso POSIX de symlink de archivo.
- Linux y macOS no están certificados en 0.7.0. Se conservan las pruebas y el
  gate multiplataforma original sigue abierto.
- La suite LLM requiere credenciales y puede tener costo; no forma parte de la
  validación local de este release.
- PR #2 permanece en borrador y GitHub Actions está bloqueado externamente por
  facturación. No se cuentan esos checks como aprobados.
