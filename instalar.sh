#!/bin/sh
# instalar.sh — instalador de repofibe para macOS/Linux/WSL/Git Bash.
# Uso:  ./instalar.sh [--host claude|antigravity|codex|cursor|opencode|generico|todos] [--workspace <ruta>] [--refrescar|--quitar]
set -e
RAIZ="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "repofibe necesita Node.js v22 o superior (recomendado: v24). Instálalo desde https://nodejs.org y vuelve a ejecutar." >&2
  exit 1
fi

version_node="$(node -p 'process.versions.node')"
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Node.js $version_node no es compatible. Repofibe necesita v22 o superior (recomendado: v24)." >&2
  exit 1
fi

if [ "${1-}" = "--diagnostico" ]; then
  shift
  exec node "$RAIZ/nucleo/diagnostico.mjs" --json "$@"
fi

exec node "$RAIZ/nucleo/instalar.mjs" "$@"
