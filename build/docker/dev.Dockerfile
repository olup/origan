FROM node:22-slim AS base

ARG PNPM_VERSION=10.8.0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@${PNPM_VERSION}

FROM base AS deps
WORKDIR /app

# Copy all package.json files while maintaining directory structure
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

COPY /packages/control-api/package.json ./packages/control-api/
COPY /packages/gateway/package.json ./packages/gateway/
COPY /packages/admin-panel/package.json ./packages/admin-panel/
COPY /packages/build-runner/package.json ./packages/build-runner/

COPY /shared/nats/package.json ./shared/nats/

# Install dependencies with cache mount
RUN --mount=type=cache,target=/pnpm/store pnpm install

FROM deps as build-shared
WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY shared/ /app/shared/
COPY --from=deps /app/shared/nats/node_modules /app/shared/nats/node_modules

# Build shared packages
RUN pnpm run --filter="./shared/*" -r build

FROM base as final
WORKDIR /app

# Copy all files
COPY . .

# Copy over the installed and built dependencies from builder
COPY --from=build-shared /app/node_modules /app/node_modules
COPY --from=build-shared /app/shared /app/shared
COPY --from=deps /app/packages /app/packages
