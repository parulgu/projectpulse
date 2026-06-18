#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_HOST="${PROJECT_PULSE_API_HOST:-127.0.0.1}"
API_PORT="${PROJECT_PULSE_API_PORT:-8000}"
FRONTEND_HOST="${PROJECT_PULSE_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${PROJECT_PULSE_FRONTEND_PORT:-5173}"

if [[ "$API_HOST" == "0.0.0.0" || "$API_HOST" == "::" ]]; then
  API_BROWSER_HOST="127.0.0.1"
else
  API_BROWSER_HOST="$API_HOST"
fi

export PROJECT_PULSE_API_HOST="$API_HOST"
export PROJECT_PULSE_API_PORT="$API_PORT"
export VITE_PROJECT_PULSE_API_URL="${VITE_PROJECT_PULSE_API_URL:-http://${API_BROWSER_HOST}:${API_PORT}/api}"

BACKEND_PID=""
FRONTEND_PID=""

find_python() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    command -v "$PYTHON_BIN" >/dev/null 2>&1 || {
      echo "Python command not found: $PYTHON_BIN" >&2
      exit 1
    }
    echo "$PYTHON_BIN"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
  elif command -v python >/dev/null 2>&1; then
    echo "python"
  else
    echo "Python is required but was not found." >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" >/dev/null 2>&1
  else
    return 1
  fi
}

stop_pid_tree() {
  local pid="$1"

  if [[ -z "$pid" ]]; then
    return
  fi

  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -P "$pid" >/dev/null 2>&1 || true
  fi

  kill "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  trap - EXIT INT TERM

  if [[ -n "$FRONTEND_PID" || -n "$BACKEND_PID" ]]; then
    echo
    echo "Stopping Project Pulse..."
  fi

  stop_pid_tree "$FRONTEND_PID"
  stop_pid_tree "$BACKEND_PID"

  if [[ -n "$FRONTEND_PID" ]]; then
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$BACKEND_PID" ]]; then
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

handle_signal() {
  cleanup
  exit 130
}

wait_for_backend() {
  if ! command -v curl >/dev/null 2>&1; then
    sleep 2
    return
  fi

  local health_url="http://${API_BROWSER_HOST}:${API_PORT}/api/health"
  local attempt

  for attempt in {1..40}; do
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      return
    fi

    if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      echo "Backend stopped before it became ready." >&2
      exit 1
    fi

    sleep 0.25
  done

  echo "Backend did not become ready at $health_url" >&2
  exit 1
}

wait_for_child_exit() {
  while true; do
    if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      wait "$BACKEND_PID"
      exit $?
    fi

    if [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
      wait "$FRONTEND_PID"
      exit $?
    fi

    sleep 1
  done
}

trap cleanup EXIT
trap handle_signal INT TERM

PYTHON_CMD="$(find_python)"
require_command npm

if port_in_use "$API_PORT"; then
  echo "Port $API_PORT is already in use. Stop the existing API first, or set PROJECT_PULSE_API_PORT." >&2
  exit 1
fi

if port_in_use "$FRONTEND_PORT"; then
  echo "Port $FRONTEND_PORT is already in use. Stop the existing frontend first, or set PROJECT_PULSE_FRONTEND_PORT." >&2
  exit 1
fi

if ! "$PYTHON_CMD" -c "import requests" >/dev/null 2>&1; then
  echo "Missing backend Python dependency: requests" >&2
  echo "Install backend dependencies with:" >&2
  echo "  $PYTHON_CMD -m pip install -r \"$ROOT_DIR/backend/requirements.txt\"" >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  if [[ -f "$ROOT_DIR/frontend/package-lock.json" ]]; then
    (cd "$ROOT_DIR/frontend" && npm ci)
  else
    (cd "$ROOT_DIR/frontend" && npm install)
  fi
fi

echo "Starting Project Pulse"
echo "API:      http://${API_BROWSER_HOST}:${API_PORT}"
echo "Frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo

(cd "$ROOT_DIR" && "$PYTHON_CMD" backend/app.py) &
BACKEND_PID="$!"

wait_for_backend

(cd "$ROOT_DIR/frontend" && npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort) &
FRONTEND_PID="$!"

echo
echo "Project Pulse is running. Press Ctrl+C to stop both servers."

wait_for_child_exit
