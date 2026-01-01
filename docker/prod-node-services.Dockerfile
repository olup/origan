# syntax=docker/dockerfile:1.7
FROM node:22-slim AS node-services
ENV NODE_ENV=production
RUN corepack enable && corepack install --global pnpm@^10.7.0

COPY docker/node-services-entrypoint.sh /usr/local/bin/node-services-entrypoint
RUN chmod +x /usr/local/bin/node-services-entrypoint

COPY control-api /prod/control-api
COPY gateway /prod/gateway
COPY builder /prod/builder

ENTRYPOINT ["/usr/local/bin/node-services-entrypoint"]
