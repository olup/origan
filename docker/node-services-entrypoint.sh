#!/usr/bin/env sh
set -eu

ROLE="${ORIGAN_ROLE:-control-api}"

case "$ROLE" in
  control-api)
    cd /prod/control-api
    exec /usr/bin/bash ./run-prod.sh
    ;;
  gateway)
    cd /prod/gateway
    exec node dist/index.js
    ;;
  builder)
    cd /prod/builder
    exec node dist/index.js
    ;;
  *)
    echo "Unknown ORIGAN_ROLE: ${ROLE}" >&2
    exit 1
    ;;
esac
