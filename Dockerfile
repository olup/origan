FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@^10.7.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS build

WORKDIR /app
COPY . .

COPY . /usr/src/app
WORKDIR /usr/src/app

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

RUN pnpm run -r build
RUN pnpm deploy --filter=@origan/control-api --prod /prod/control/api
RUN pnpm deploy --filter=@origan/gateway --prod /prod/gateway
RUN pnpm deploy --filter=@origan/runner --prod /prod/runner

FROM base AS control-api
COPY --from=build /prod/control/api /prod/control/api
WORKDIR /prod/control/api
EXPOSE 9999
ENTRYPOINT ["/usr/bin/bash"]
CMD ["./run-prod.sh"]

FROM base AS gateway
COPY --from=build /prod/gateway /prod/gateway
WORKDIR /prod/gateway
EXPOSE 7777
ENTRYPOINT ["/usr/bin/bash"]
CMD ["./run-prod.sh"]

FROM ghcr.io/supabase/edge-runtime:v1.67.4 AS runner
COPY --from=build /prod/runner /app
WORKDIR /app
EXPOSE 9000
CMD ["start", "--main-service", "/app/functions/supervisor"]
