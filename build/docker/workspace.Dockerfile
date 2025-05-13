FROM origan-node-base

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,target=/pnpm/store pnpm fetch
