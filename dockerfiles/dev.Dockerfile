FROM node:22-slim AS base

ARG PNPM_VERSION=10.8.0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@${PNPM_VERSION}

FROM base AS deps
WORKDIR /app

# Copy package files for dependency resolution
COPY . .

# Install dependencies with cache mount
RUN --mount=type=cache,target=/pnpm/store pnpm install

# Build shared packages using turbo (dependencies will be built in order)
RUN pnpm run build --filter="./shared/*"
