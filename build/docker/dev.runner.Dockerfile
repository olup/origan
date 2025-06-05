FROM ghcr.io/supabase/edge-runtime:v1.67.4

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y curl ca-certificates --no-install-recommends && \
        curl -fsSL https://apt.cli.rs/pubkey.asc > /usr/share/keyrings/rust-tools.asc && \
        curl -fsSL https://apt.cli.rs/rust-tools.list > /etc/apt/sources.list.d/rust-tools.list &&   \
        apt-get update && apt-get install -y --no-install-recommends watchexec-cli && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ./packages/runner .

ENTRYPOINT [ "/usr/bin/watchexec" ]
