#!/usr/bin/env bash
set -euo pipefail

PUBLIC_HOST="${PROJECT_PULSE_PUBLIC_HOST:-100.108.183.61}"
API_PORT="${PROJECT_PULSE_API_PORT:-8000}"
FRONTEND_PORT="${PROJECT_PULSE_FRONTEND_PORT:-5173}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$SCRIPT_DIR"
COPY_ROOT="${PROJECT_PULSE_COPY_ROOT:-"$(cd "$SOURCE_ROOT/.." && pwd)/Project Pulse copy"}"
API_URL="http://${PUBLIC_HOST}:${API_PORT}/api"

python_cmd="python3"
if ! command -v "$python_cmd" >/dev/null 2>&1; then
  python_cmd="python"
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

port_in_use() {
  lsof -ti "tcp:$1" >/dev/null 2>&1
}

require_command npm
require_command rsync
require_command lsof
require_command "$python_cmd"

echo "Preparing Project Pulse copy"
echo "Source: $SOURCE_ROOT"
echo "Copy:   $COPY_ROOT"
echo "API:    $API_URL"

if port_in_use "$API_PORT"; then
  echo "Port $API_PORT is already in use. Stop that backend first, then rerun this script." >&2
  exit 1
fi

if port_in_use "$FRONTEND_PORT"; then
  echo "Port $FRONTEND_PORT is already in use. Stop that frontend first, then rerun this script." >&2
  exit 1
fi

echo "Building frontend for $API_URL"
cd "$SOURCE_ROOT/frontend"
rm -rf dist
VITE_PROJECT_PULSE_API_URL="$API_URL" npm run build

echo "Refreshing copy folder"
mkdir -p "$COPY_ROOT/backend" "$COPY_ROOT/frontend"

rsync -a "$SOURCE_ROOT/.gitignore" "$SOURCE_ROOT/README.md" "$COPY_ROOT/"
rsync -a \
  "$SOURCE_ROOT/backend/app.py" \
  "$SOURCE_ROOT/backend/__init__.py" \
  "$SOURCE_ROOT/backend/requirements.txt" \
  "$SOURCE_ROOT/backend/project-pulse.config.json" \
  "$COPY_ROOT/backend/"

rsync -a \
  "$SOURCE_ROOT/frontend/index.html" \
  "$SOURCE_ROOT/frontend/package.json" \
  "$SOURCE_ROOT/frontend/package-lock.json" \
  "$COPY_ROOT/frontend/"
rsync -a --delete "$SOURCE_ROOT/frontend/src/" "$COPY_ROOT/frontend/src/"
rsync -a --delete "$SOURCE_ROOT/frontend/dist/" "$COPY_ROOT/frontend/dist/"

if ! grep -R "${PUBLIC_HOST}:${API_PORT}" "$COPY_ROOT/frontend/dist/assets" >/dev/null 2>&1; then
  echo "Build verification failed: copied frontend does not point to ${PUBLIC_HOST}:${API_PORT}." >&2
  exit 1
fi
