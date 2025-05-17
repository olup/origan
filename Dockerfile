FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@^10.7.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# build shared packages
RUN pnpm run --filter="./shared/*" -r build
# build control-api - other packages depends on its types
RUN pnpm run --filter=@origan/control-api -r build
# build other packages
RUN pnpm run --filter=@origan/gateway --filter=@origan/build-runner -r build

RUN pnpm deploy --filter=@origan/control-api --prod /prod/control-api
RUN pnpm deploy --filter=@origan/gateway --prod /prod/gateway
RUN pnpm deploy --filter=@origan/build-runner --prod /prod/build-runner

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

FROM base AS build-runner
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /prod/build-runner /prod/build-runner
WORKDIR /prod/build-runner
ENTRYPOINT [ "node", "dist/index.js" ]

FROM ghcr.io/supabase/edge-runtime:v1.67.4 AS runner
COPY --from=build app/packages/runner /app
WORKDIR /app
EXPOSE 9000
CMD ["start", "--main-service", "/app/functions/supervisor"]
