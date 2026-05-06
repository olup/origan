# Origan

Origan is a monorepo for the platform services, apps, and infrastructure. It supports local development with `pnpm`, Docker-based supporting services, and production deployment with Pulumi.

## Repo Layout

- `packages/` application and service packages such as `control-api`, `admin`, `landing`, `builder`, and `cli`
- `infra/` Pulumi infrastructure code
- `shared/` shared runtime dependencies such as NATS configuration
- `docs/` deeper architecture and local setup guides

## Quick Start

Install workspace dependencies:

```sh
pnpm install
```

Start the main local development services:

```sh
pnpm dev
```

If you need the local custom-domain flow with Pebble ACME and Docker services, see `docs/LOCAL_DOMAIN_TESTING.md`.

## Build And Deploy

This repo builds Docker images locally and deploys to Kubernetes with Pulumi.

## Build Images

Build and push service images (control-api, gateway, builder, runner):

```sh
IMAGE_TAG=prod scripts/build-images.sh
```

Common options:

- `ORIGAN_TARGETS=control-api,gateway,builder,runner` to limit targets.
- `ORIGAN_SEQUENTIAL=1` to build one target at a time.
- `ORIGAN_SINGLE_IMAGE=1` to build `node-services` + `runner`.
- `ORIGAN_LOCAL_ARTIFACTS=1` to use `.docker-prod` (requires `scripts/build-artifacts.sh`).
- `ORIGAN_DISABLE_CACHE=1` to skip build cache.
- `ORIGAN_CLEAN_IMAGES=1` to remove built images after push.
- `ORIGAN_CLEAN_CACHE=1` to prune buildx cache after push.

The script also prints resolved image digests for Pulumi.

## Deploy with Pulumi

Deploy the `prod` stack from `infra/` using image tags:

```sh
cd infra
PULUMI_CONFIG_PASSPHRASE="" IMAGE_TAG=prod pulumi up --yes
```

Pulumi resolves the image tag to a digest at deploy time, so you only need
to set `IMAGE_TAG`.

For infrastructure details and stack configuration, see `infra/README.md`.

## Troubleshooting

- If Docker runs out of space, clean it:
  ```sh
  docker system prune -af --volumes
  ```
- If Pulumi warns about pending operations, run `pulumi refresh` interactively.
