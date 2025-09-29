FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@^10.7.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy workspace structure and package files first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# Copy each package.json to maintain structure (only backend services)
COPY packages/builder/package.json packages/builder/
COPY packages/control-api/package.json packages/control-api/
COPY packages/gateway/package.json packages/gateway/
# Copy shared packages
COPY shared/nats/package.json shared/nats/

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install

# Build stage
FROM deps AS build
WORKDIR /app

# Copy source files
COPY packages ./packages
COPY shared ./shared
COPY turbo.json ./

ENV TURBO_TELEMETRY_DISABLED=1
ENV VITE_APP_ENV=production

# Build with turbo cache - build all backend services
RUN --mount=type=cache,target=.turbo \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm run build --filter=@origan/control-api --filter=@origan/gateway --filter=@origan/builder

# Deploy production packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter=@origan/control-api --prod /prod/control-api && \
    pnpm deploy --filter=@origan/gateway --prod /prod/gateway && \
    pnpm deploy --filter=@origan/builder --prod /prod/builder

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
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g @antfu/ni
COPY --from=build /prod/builder /prod/builder
WORKDIR /prod/builder
ENTRYPOINT [ "node", "dist/index.js" ]

FROM ghcr.io/supabase/edge-runtime:v1.67.4 AS runner
# Runner doesn't need Node builds, just copy the Deno functions directly
COPY packages/runner /app
WORKDIR /app
EXPOSE 9000
CMD ["start", "--main-service", "/app/functions/supervisor", "--event-worker", "/app/functions/event-worker"]