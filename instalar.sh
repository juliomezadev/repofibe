#!/bin/sh
# instalar.sh — instalador de repofibe para macOS/Linux/WSL/Git Bash.
# Uso:  ./instalar.sh [--host claude|antigravity|codex|cursor|opencode|generico|todos] [--workspace <ruta>] [--quitar]
set -e
RAIZ="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "repofibe necesita Node.js (v18+). Instálalo desde https://nodejs.org y vuelve a ejecutar." >&2
  exit 1
fi

exec node "$RAIZ/nucleo/instalar.mjs" "$@"
