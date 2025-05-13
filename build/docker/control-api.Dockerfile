FROM origan-workspace

WORKDIR /app
COPY packages/control-api .
RUN --mount=type=cache,target=/pnpm/store pnpm install
