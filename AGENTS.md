# Origan Agent Notes

## Build

Use `scripts/build-images.sh` to build and push images:

```sh
IMAGE_TAG=prod scripts/build-images.sh
```

Useful flags:

- `ORIGAN_TARGETS=...` to pick targets.
- `ORIGAN_SEQUENTIAL=1` to reduce peak disk usage.
- `ORIGAN_SINGLE_IMAGE=1` for `node-services` + `runner`.
- `ORIGAN_LOCAL_ARTIFACTS=1` with `.docker-prod` (run `scripts/build-artifacts.sh` first).
- `ORIGAN_CLEAN_IMAGES=1` and/or `ORIGAN_CLEAN_CACHE=1` to save disk.

## Deploy

Pulumi runs from `infra/` and resolves tags to digests:

```sh
cd infra
PULUMI_CONFIG_PASSPHRASE="" IMAGE_TAG=prod pulumi up --yes
```

## Disk Cleanup

```sh
docker system prune -af --volumes
```
