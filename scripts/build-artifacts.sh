#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${ORIGAN_ARTIFACTS_DIR:-.docker-prod}"
SKIP_INSTALL="${ORIGAN_SKIP_INSTALL:-}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
mkdir -p "$OUT_DIR/docker"

if [[ "${SKIP_INSTALL}" != "1" ]]; then
  pnpm install --frozen-lockfile
fi

pnpm run build --filter=@origan/control-api --filter=@origan/gateway --filter=@origan/builder

pnpm deploy --filter=@origan/control-api --prod "$OUT_DIR/control-api" & \
pnpm deploy --filter=@origan/gateway --prod "$OUT_DIR/gateway" & \
pnpm deploy --filter=@origan/builder --prod "$OUT_DIR/builder" & \
wait

cp -a docker/node-services-entrypoint.sh "$OUT_DIR/docker/node-services-entrypoint.sh"
cp -a packages/runner "$OUT_DIR/runner"
