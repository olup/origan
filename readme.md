# Origan Build & Deploy

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

## Troubleshooting

- If Docker runs out of space, clean it:
  ```sh
  docker system prune -af --volumes
  ```
- If Pulumi warns about pending operations, run `pulumi refresh` interactively.
