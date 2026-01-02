ARG WORKERD_VERSION=1.20260101.0
FROM node:22-slim AS workerd
RUN npm install -g workerd@${WORKERD_VERSION}

FROM node:22-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
COPY --from=workerd /usr/local/bin/workerd /usr/local/bin/workerd

WORKDIR /app
CMD ["workerd", "serve", "/app/workerd/worker.capnp", "config"]
