docker_compose("docker-compose.yml")
docker_prune_settings()

# Base image with pnpm already installed
docker_build(
    "origan-dev",
    context=".",
    dockerfile="build/docker/dev.Dockerfile",
    live_update=[
        sync(".", "/app"),
        run(
            "cd /app && pnpm install",
            trigger=[
                "package.json",
                "pnpm-lock.yaml",
                "packages/*/package.json",
                "shared/*/package.json",
            ],
        ),
    ],
)

docker_build(
    "origan-runner",
    context=".",
    dockerfile="build/docker/dev.runner.Dockerfile",
    live_update=[
        sync(".", "/app"),
        run(
            "cd /app && pnpm install",
            trigger=[
                "package.json",
                "pnpm-lock.yaml",
                "packages/*/package.json",
                "shared/*/package.json",
            ],
        ),
    ],
)

services = ["control-api", "admin-panel", "gateway", "runner"]
for service in services:
    dc_resource(service, labels=["1-main"])

dc_resource("runner", labels=["1-main"])

dc_resource("db", labels=["2-external"])
dc_resource("nats", labels=["2-external"])
dc_resource("minio", labels=["2-external"])
dc_resource("smee", labels=["2-external"])

local_resource(
    "cli",
    cmd="cd packages/cli && pnpm build",
    deps="packages/cli",
    ignore=["packages/cli/dist"],
    labels=["1-main"],
    allow_parallel=True,
)

local_resource(
    "origan-build-runner",
    "docker build -t origan-build-runner -f ./build/docker/dev.buildRunner.Dockerfile .",
    deps=["packages/build-runner"],
    labels=["1-main"],
    allow_parallel=True,
)
