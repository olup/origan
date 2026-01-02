#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="$ROOT_DIR/packages/runner/workerd/test/worker.capnp"
PORT="9010"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to run workerd via npx"
  exit 1
fi

echo "Starting workerd test server..."
echo "Config: $CONFIG_PATH"
echo "Port: $PORT"

if command -v lsof >/dev/null 2>&1; then
  existing_pid="$(lsof -ti tcp:$PORT 2>/dev/null || true)"
  if [ -n "$existing_pid" ]; then
    echo "Port $PORT is in use by PID $existing_pid, stopping it."
    kill "$existing_pid" 2>/dev/null || true
  fi
fi

npx -y workerd@1.20260101.0 serve "$CONFIG_PATH" config --experimental >/tmp/workerd-smoke-test.log 2>&1 &
pid=$!

tries=0
until curl -s "http://localhost:$PORT" >/tmp/workerd-smoke-test.out 2>/dev/null; do
  tries=$((tries+1))
  if [ $tries -gt 20 ]; then
    break
  fi
  sleep 1
  if ! kill -0 $pid 2>/dev/null; then
    break
  fi
done

if [ -f /tmp/workerd-smoke-test.out ]; then
  cat /tmp/workerd-smoke-test.out
  echo
else
  echo "No response received. Check /tmp/workerd-smoke-test.log"
fi

kill $pid 2>/dev/null || true
wait $pid 2>/dev/null || true
