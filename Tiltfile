docker_compose("docker-compose.yml")
docker_prune_settings()

# Base image with pnpm already installed
docker_build(
    "origan-node-base",
    context="build/docker",
    dockerfile="build/docker/base.Dockerfile",
)

# Image with most of the dependencies fetched into the store
# This is mostly to avoid refetching all the dependencies between services,
# even though they're the same.
docker_build(
    "origan-workspace",
    context=".",
    only=["pnpm-lock.yaml", "pnpm-workspace.yaml"],
    dockerfile="build/docker/workspace.Dockerfile",
)


def build_with_reload(name):
    live_update = [
        sync("./packages/{}".format(name), "/app/"),
    ]
    if os.path.exists("./packages/{}/package.json".format(name)):
        live_update.append(
            run("pnpm install", trigger=["package.json", "pnpm-lock.yaml"])
        )

    return docker_build(
        "origan-{}".format(name),
        context=".",
        dockerfile="build/docker/{}.Dockerfile".format(name),
        live_update=live_update,
    )


services = ["control-api", "admin-panel", "gateway", "runner"]

local_resource(
    "origan-build-runner",
    "docker build -t origan-build-runner .",
    deps=["."],
    labels=["3-static"],
)

for service in services:
    build_with_reload(service)
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
)
