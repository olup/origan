docker_compose("docker-compose.yml")
docker_prune_settings()


# General dev docker image
docker_build(
    "origan-dev",
    context=".",
    dockerfile="build/docker/dev.Dockerfile",
    ignore=["_tmp_*"],
    live_update=[
        sync("./packages", "/app/packages"),
        sync("./shared", "/app/shared"),
        run("pnpm install", trigger=["package.json", "pnpm-lock.yaml"]),
        run("pnpm run db:migrate", trigger=["packages/control-api/drizzle"]),
    ],
)

docker_build(
    "origan-runner",
    context=".",
    dockerfile="build/docker/runner.Dockerfile",
    ignore=["_tmp_*"],
    live_update=[
        sync("./packages", "/app/packages"),
        sync("./shared", "/app/shared"),
        run("pnpm install", trigger=["package.json", "pnpm-lock.yaml"]),
    ],
)

local_resource(
    "cli",
    cmd="cd packages/cli && pnpm build",
    deps="packages/cli",
    ignore=["packages/cli/dist"],
    labels=["1-main"],
)

local_resource(
    "origan-build-runner",
    "docker build --target build-runner -t origan-build-runner .",
    deps=["packages/build-runner"],
    labels=["1-main"],
)

dc_resource("control-api", labels=["1-main"])
dc_resource("gateway", labels=["1-main"])
dc_resource("admin-panel", labels=["1-main"])

dc_resource("runner", labels=["1-main"])

dc_resource("db", labels=["2-external"])
dc_resource("nats", labels=["2-external"])
dc_resource("minio", labels=["2-external"])
dc_resource("smee", labels=["2-external"])
