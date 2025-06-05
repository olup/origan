FROM origan-workspace

WORKDIR /app
COPY packages/gateway .
RUN --mount=type=cache,target=/pnpm/store pnpm install
