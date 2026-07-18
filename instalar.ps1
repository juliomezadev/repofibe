# instalar.ps1 — instalador de repofibe para Windows.
# Uso:  .\instalar.ps1 [-Host claude|antigravity|codex|cursor|opencode|generico|todos] [-Workspace <ruta>] [-Quitar]
param(
    [string]$RepoHost = "",
    [string]$Workspace = "",
    [switch]$Quitar
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "repofibe necesita Node.js (v18+). Instálalo desde https://nodejs.org y vuelve a ejecutar." -ForegroundColor Red
    exit 1
}

$argumentos = @()
if ($Quitar) { $argumentos += "--quitar" }
if ($RepoHost) { $argumentos += @("--host", $RepoHost) }
if ($Workspace) { $argumentos += @("--workspace", $Workspace) }

node "$raiz\nucleo\instalar.mjs" @argumentos
exit $LASTEXITCODE
