FROM oven/bun:latest AS base

WORKDIR /app

# Preload turbo
RUN bun install --global turbo@2.4.5-canary.5

COPY . .

RUN turbo prune api --docker

# # Cache packages installation
# COPY package.json package.json
# COPY bun.lock bun.lock

FROM base AS build

WORKDIR /app

COPY --from=base /app/out/json/ .
# XXX: We should have --frozen-lockfile here, not sure why we don't
RUN bun install

COPY --from=base /app/out/full/ .

ENV NODE_ENV=production

RUN turbo run build 

FROM gcr.io/distroless/base:latest

WORKDIR /app

COPY --from=build /app/apps/api/dist/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 9999
