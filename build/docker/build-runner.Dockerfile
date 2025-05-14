FROM origan-workspace

WORKDIR /app
COPY packages/build-runner .
RUN --mount=type=cache,target=/pnpm/store pnpm install
