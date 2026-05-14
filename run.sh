#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

VENV_DIR="${MAA_WEB_VENV:-$ROOT_DIR/.venv}"
VENV_PY="$VENV_DIR/bin/python"
STAMP_FILE="$VENV_DIR/.maa-web-control-deps"

find_python() {
  if [[ -n "${PYTHON:-}" ]]; then
    printf '%s\n' "$PYTHON"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return
  fi
  echo "Python 3.11+ is required but was not found." >&2
  exit 1
}

install_dependencies() {
  "$VENV_PY" -m pip install --upgrade pip
  "$VENV_PY" -m pip install -e .
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
}

if [[ ! -x "$VENV_PY" ]]; then
  "$(find_python)" -m venv "$VENV_DIR"
fi

if [[ ! -f "$STAMP_FILE" || pyproject.toml -nt "$STAMP_FILE" ]]; then
  install_dependencies
fi

exec "$VENV_PY" -m uvicorn app.main:app \
  --host "${MAA_WEB_HOST:-0.0.0.0}" \
  --port "${MAA_WEB_PORT:-8000}"
