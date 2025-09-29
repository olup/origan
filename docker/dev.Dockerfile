FROM node:22-slim AS base

ARG PNPM_VERSION=10.8.0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@${PNPM_VERSION}

FROM base AS dev

# Installing git for better stability to turborepo watch algorithm
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*


WORKDIR /app

# Copy source code
COPY . .

# Initialize git repository and make an initial commit
RUN git config --global user.email "docker@build.local" \
    && git config --global user.name "Docker Build" \
    && git init \
    && git add . \
    && git commit -m "initial commit"

# Install dependencies using cache mount and shared store
RUN pnpm install --frozen-lockfile

# Command to keep container running
CMD ["tail", "-f", "/dev/null"]
