# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@^10.7.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Build stage - copy everything and install
FROM base AS build
WORKDIR /app

# Copy workspace config and lockfile first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY turbo.json ./

# Copy only package.json files to maximize cache reuse for pnpm install
COPY packages/control-api/package.json ./packages/control-api/
COPY packages/gateway/package.json ./packages/gateway/
COPY packages/builder/package.json ./packages/builder/
COPY shared/nats/package.json ./shared/nats/

# Copy full source after deps are cached
COPY packages ./packages
COPY shared ./shared

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

ENV TURBO_TELEMETRY_DISABLED=1
ENV VITE_APP_ENV=production

# Enable Turbo Remote Cache if provided (massive speedup in CI)
ARG TURBO_TOKEN
ARG TURBO_TEAM
ENV TURBO_TOKEN=${TURBO_TOKEN}
ENV TURBO_TEAM=${TURBO_TEAM}

# Build all backend services
RUN --mount=type=cache,target=.turbo \
    pnpm run build --filter=@origan/control-api --filter=@origan/gateway --filter=@origan/builder

# Deploy production packages in parallel
RUN pnpm deploy --filter=@origan/control-api --prod /prod/control-api & \
    pnpm deploy --filter=@origan/gateway --prod /prod/gateway & \
    pnpm deploy --filter=@origan/builder --prod /prod/builder & \
    wait

# Production stages
FROM base AS control-api
COPY --from=build /prod/control-api /prod/control-api
WORKDIR /prod/control-api
EXPOSE 9999
ENTRYPOINT ["/usr/bin/bash"]
CMD ["./run-prod.sh"]

FROM base AS gateway
COPY --from=build /prod/gateway /prod/gateway
WORKDIR /prod/gateway
EXPOSE 9999
CMD [ "node", "dist/index.js" ]

FROM base AS builder
# Cache apt packages for faster rebuilds
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends git && \
    npm install -g @antfu/ni
COPY --from=build /prod/builder /prod/builder
WORKDIR /prod/builder
ENTRYPOINT [ "node", "dist/index.js" ]

FROM base AS node-services
COPY docker/node-services-entrypoint.sh /usr/local/bin/node-services-entrypoint
RUN chmod +x /usr/local/bin/node-services-entrypoint
COPY --from=build /prod/control-api /prod/control-api
COPY --from=build /prod/gateway /prod/gateway
COPY --from=build /prod/builder /prod/builder
ENTRYPOINT ["/usr/local/bin/node-services-entrypoint"]

FROM ghcr.io/supabase/edge-runtime:v1.67.4 AS runner
COPY packages/runner /app
WORKDIR /app
EXPOSE 9000
CMD ["start", "--main-service", "/app/functions/supervisor", "--event-worker", "/app/functions/event-worker"]
