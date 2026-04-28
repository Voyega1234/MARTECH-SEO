#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STEP2_HOST="${STEP2_HOST:-127.0.0.1}"
STEP2_PORT="${STEP2_PORT:-8010}"
UVICORN_BIN="${UVICORN_BIN:-.venv/bin/uvicorn}"

APP_PID=""
STEP2_PID=""

cleanup() {
  echo
  echo "Stopping MARTECH-SEO dev processes..."

  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi

  if [ -n "$STEP2_PID" ]; then
    kill "$STEP2_PID" 2>/dev/null || true
  fi

  wait "$APP_PID" 2>/dev/null || true
  wait "$STEP2_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

if [ ! -x "$UVICORN_BIN" ]; then
  echo "Step 2 API runner not found: $UVICORN_BIN"
  echo "Create the Python venv or run with UVICORN_BIN=/path/to/uvicorn."
  exit 1
fi

echo "Starting Step 2 API on http://${STEP2_HOST}:${STEP2_PORT}"
"$UVICORN_BIN" step2_api.app:app --reload --host "$STEP2_HOST" --port "$STEP2_PORT" &
STEP2_PID="$!"

echo "Starting main app with npm run dev:all"
npm run dev:all &
APP_PID="$!"

echo
echo "MARTECH-SEO dev environment is starting:"
echo "- Main app: npm run dev:all"
echo "- Step 2 API: http://${STEP2_HOST}:${STEP2_PORT}"
echo
echo "Press Ctrl+C to stop both."

wait "$APP_PID"
