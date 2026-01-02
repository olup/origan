#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${ORIGAN_ARTIFACTS_DIR:-.docker-prod}"
SKIP_INSTALL="${ORIGAN_SKIP_INSTALL:-}"
IMAGE="${ORIGAN_LINUX_BUILDER_IMAGE:-node:22-slim}"

mkdir -p .docker-cache/pnpm .docker-cache/turbo
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
mkdir -p "$OUT_DIR/docker"

INSTALL_CMD="pnpm install --frozen-lockfile"
if [[ "${SKIP_INSTALL}" == "1" ]]; then
  INSTALL_CMD="echo 'Skipping install'"
fi

docker run --rm \
  --platform linux/amd64 \
  -v "$ROOT:/work" \
  -v "$ROOT/.docker-cache/pnpm:/pnpm/store" \
  -v "$ROOT/.docker-cache/turbo:/work/.turbo" \
  -w /work \
  -e PNPM_HOME=/pnpm \
  -e PATH=/pnpm:$PATH \
  -e CI=1 \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  "$IMAGE" \
  bash -lc "
    set -euo pipefail
    corepack enable
    corepack install --global pnpm@^10.7.0
    ${INSTALL_CMD}
    pnpm run build --filter=@origan/control-api --filter=@origan/gateway --filter=@origan/builder
    rm -rf '${OUT_DIR}/control-api' '${OUT_DIR}/gateway' '${OUT_DIR}/builder'
    pnpm deploy --filter=@origan/control-api --prod '${OUT_DIR}/control-api'
    pnpm deploy --filter=@origan/gateway --prod '${OUT_DIR}/gateway'
    pnpm deploy --filter=@origan/builder --prod '${OUT_DIR}/builder'
    cp -a docker/node-services-entrypoint.sh '${OUT_DIR}/docker/node-services-entrypoint.sh'
    cp -a packages/runner '${OUT_DIR}/runner'
  "
