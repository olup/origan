FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@^10.7.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS build
WORKDIR /app

# Copy package files for dependency resolution
COPY . .

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Set environment variable for admin panel Vite build
ENV VITE_APP_ENV=production

# Build only backend packages using turbo filter
# This excludes frontend packages (admin, landing) to save build time
# Disable turbo telemetry to avoid issues
ENV TURBO_TELEMETRY_DISABLED=1
# Build specific backend packages and their dependencies
RUN pnpm run build --filter=@origan/control-api --filter=@origan/gateway --filter=@origan/builder

RUN pnpm deploy --filter=@origan/control-api --prod /prod/control-api
RUN pnpm deploy --filter=@origan/gateway --prod /prod/gateway
RUN pnpm deploy --filter=@origan/builder --prod /prod/builder

ARG WORKERD_VERSION=1.20260101.0
FROM base AS workerd
RUN npm install -g workerd@${WORKERD_VERSION}

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

FROM base AS runner
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    update-ca-certificates
COPY --from=workerd /usr/local/bin/workerd /usr/local/bin/workerd
COPY --from=build app/packages/runner /app
WORKDIR /app
EXPOSE 9000
CMD ["workerd", "serve", "/app/workerd/worker.capnp", "config"]
