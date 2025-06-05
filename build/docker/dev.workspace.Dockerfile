FROM origan-node-base

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/control-api/package.json packages/control-api/
COPY shared/nats/package.json shared/nats/


RUN --mount=type=cache,target=/pnpm/store pnpm fetch
