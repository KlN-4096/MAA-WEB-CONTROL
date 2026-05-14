#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec "$ROOT_DIR/.venv/bin/uvicorn" app.main:app \
  --host "${MAA_WEB_HOST:-0.0.0.0}" \
  --port "${MAA_WEB_PORT:-8000}"
