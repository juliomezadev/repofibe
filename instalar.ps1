# instalar.ps1 — instalador de repofibe para Windows.
# Uso:  .\instalar.ps1 [-Host claude|antigravity|codex|cursor|opencode|generico|todos] [-Workspace <ruta>] [-Quitar]
param(
    [string]$RepoHost = "",
    [string]$Workspace = "",
    [switch]$Quitar,
    [switch]$Refrescar,
    [switch]$Diagnostico
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "repofibe necesita Node.js v22 o superior (recomendado: v24). Instálalo desde https://nodejs.org y vuelve a ejecutar." -ForegroundColor Red
    exit 1
}

$versionNode = (& node --version).Trim().TrimStart('v')
try { $versionMayor = [int]($versionNode.Split('.')[0]) } catch { $versionMayor = 0 }
if ($versionMayor -lt 22) {
    Write-Host "Node.js $versionNode no es compatible. Repofibe necesita v22 o superior (recomendado: v24)." -ForegroundColor Red
    exit 1
}

if ($Quitar -and $Refrescar) {
    Write-Host "No se pueden combinar -Quitar y -Refrescar." -ForegroundColor Red
    exit 2
}

if ($Diagnostico) {
    $diagnostico = @("--json")
    if ($RepoHost) { $diagnostico += @("--host", $RepoHost) }
    node "$raiz\nucleo\diagnostico.mjs" @diagnostico
    exit $LASTEXITCODE
}

$argumentos = @()
if ($Quitar) { $argumentos += "--quitar" }
if ($Refrescar) { $argumentos += "--refrescar" }
if ($RepoHost) { $argumentos += @("--host", $RepoHost) }
if ($Workspace) { $argumentos += @("--workspace", $Workspace) }

node "$raiz\nucleo\instalar.mjs" @argumentos
exit $LASTEXITCODE
