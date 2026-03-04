#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

API_PORT="${API_PORT:-3300}"
WEB_PORT="${WEB_PORT:-5173}"

API_PID=""
WEB_PID=""
API_STARTED=0

is_port_in_use() {
  local port="$1"
  lsof -iTCP:"${port}" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

find_available_port() {
  local port="$1"
  while is_port_in_use "${port}"; do
    port="$((port + 1))"
  done
  echo "${port}"
}

cleanup() {
  if [[ "${API_STARTED}" -eq 1 ]] && [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" >/dev/null 2>&1; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup INT TERM EXIT

if is_port_in_use "${API_PORT}"; then
  echo "[next:start] api port :${API_PORT} already in use, reuse existing api service"
else
  echo "[next:start] starting api on :${API_PORT}"
  PORT="${API_PORT}" npm run next:api:dev &
  API_PID="$!"
  API_STARTED=1
fi

WEB_PORT="$(find_available_port "${WEB_PORT}")"
echo "[next:start] starting web on :${WEB_PORT} (proxy /api -> :${API_PORT})"
VITE_PORT="${WEB_PORT}" API_PORT="${API_PORT}" npm run next:web:dev &
WEB_PID="$!"

EXIT_CODE=0
if [[ "${API_STARTED}" -eq 0 ]]; then
  wait "${WEB_PID}" || EXIT_CODE=$?
else
  while true; do
    if ! kill -0 "${API_PID}" >/dev/null 2>&1; then
      wait "${API_PID}" || EXIT_CODE=$?
      break
    fi
    if ! kill -0 "${WEB_PID}" >/dev/null 2>&1; then
      wait "${WEB_PID}" || EXIT_CODE=$?
      break
    fi
    sleep 1
  done
fi

echo "[next:start] one process exited (${EXIT_CODE}), stopping the other..."
cleanup
if [[ "${API_STARTED}" -eq 1 ]]; then
  wait "${API_PID}" >/dev/null 2>&1 || true
fi
wait "${WEB_PID}" >/dev/null 2>&1 || true
exit "${EXIT_CODE}"
