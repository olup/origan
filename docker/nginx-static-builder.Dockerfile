# Multi-stage build for nginx with static content
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/admin/package.json ./packages/admin/
COPY packages/landing/package.json ./packages/landing/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/admin ./packages/admin
COPY packages/landing ./packages/landing

# Build both projects
RUN cd packages/admin && pnpm run build
RUN cd packages/landing && pnpm run build

# Final nginx stage
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy built static content from builder
COPY --from=builder /app/packages/admin/dist /usr/share/nginx/admin
COPY --from=builder /app/packages/landing/out /usr/share/nginx/landing

# Copy nginx configuration
ARG NGINX_CONF_PATH=infra/nginx.conf
COPY ${NGINX_CONF_PATH} /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]