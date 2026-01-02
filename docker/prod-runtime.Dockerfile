# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
ENV NODE_ENV=production
RUN corepack enable && corepack install --global pnpm@^10.7.0

FROM base AS control-api
COPY control-api /prod/control-api
WORKDIR /prod/control-api
EXPOSE 9999
ENTRYPOINT ["/usr/bin/bash"]
CMD ["./run-prod.sh"]

FROM base AS gateway
COPY gateway /prod/gateway
WORKDIR /prod/gateway
EXPOSE 9999
CMD ["node", "dist/index.js"]

FROM base AS builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    update-ca-certificates && \
    npm install -g @antfu/ni
COPY builder /prod/builder
WORKDIR /prod/builder
ENTRYPOINT ["node", "dist/index.js"]

ARG WORKERD_VERSION=1.20260101.0
FROM base AS workerd
RUN npm install -g workerd@${WORKERD_VERSION}

FROM base AS runner
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    update-ca-certificates
COPY --from=workerd /usr/local/bin/workerd /usr/local/bin/workerd
COPY runner /app
WORKDIR /app
EXPOSE 9000
CMD ["workerd", "serve", "--experimental", "/app/workerd/worker.capnp", "config"]
