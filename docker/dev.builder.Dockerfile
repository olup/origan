FROM node:22-slim AS base

ARG PNPM_VERSION=10.8.0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@${PNPM_VERSION}

FROM base AS builder-dev

RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/builder/package.json ./packages/builder/
COPY packages/control-api/package.json ./packages/control-api/
COPY shared/nats/package.json ./shared/nats/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --no-frozen-lockfile \
      --filter=@origan/control-api... \
      --filter=@origan/builder... \
      --filter=@origan/nats...

COPY packages/builder ./packages/builder/
COPY packages/control-api ./packages/control-api/
COPY shared/nats ./shared/nats/
COPY turbo.json ./

RUN pnpm build --filter=@origan/nats
RUN pnpm build --filter=@origan/control-api
RUN pnpm build --filter=@origan/builder

WORKDIR /app/packages/builder

CMD ["pnpm", "dev"]
