#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_PORT="${RUNNER_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"

cleanup() {
  if [[ -n "${RUNNER_PID:-}" ]]; then kill "$RUNNER_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "$FRONTEND_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

echo "[1/3] Starting runner on :${RUNNER_PORT}"
(
  cd "$ROOT_DIR/runner"
  RUNNER_ADDR=":${RUNNER_PORT}" go run ./cmd/runner
) &
RUNNER_PID=$!

echo "[2/3] Starting frontend on http://127.0.0.1:${FRONTEND_PORT}"
(
  cd "$ROOT_DIR/frontend"
  RUNNER_BASE_URL="http://127.0.0.1:${RUNNER_PORT}" FRONTEND_PORT="${FRONTEND_PORT}" npm start
) &
FRONTEND_PID=$!

echo "[3/3] Ready"
echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Runner:   http://127.0.0.1:${RUNNER_PORT}"

echo "Press Ctrl+C to stop both services."
wait
