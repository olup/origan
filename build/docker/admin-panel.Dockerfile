FROM origan-workspace

WORKDIR /app
COPY packages/admin-panel .
RUN --mount=type=cache,target=/pnpm/store pnpm install
