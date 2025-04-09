

## Running locally
All services are declared in the docker-compose file in the root of the monorepo.

To start the services locally, you can run (from the root of the monorepo):
```bash
docker-compose up
```

## Origan CLI
Cli is situated in the `packages/cli` directory.

To use the cli locally, you need to build it and make it available to your broader system.

*Note : building the cli will also build the control api*

The cli needs to know where to call the control api at build time, this is declared in the `src/constants.ts` file.

Then, from anywhere in the monorepo, you can run:
```bash
pnpm -F @origan/cli run build
```

To let the cli build continuously while developing, you can run:
```bash
pnpm -F @origan/cli run dev
```

In any cases, to then make the built cli available to your system, you can run (from the cli directory):
```bash
pnpm link
```
This will create a symlink to the built cli in your global node_modules directory, allowing you to run it from anywhere on your system. This is only needed once.

To uninstall the cli, you can run:
```bash
pnpm unlink
```
This will remove the symlink from your global node_modules directory.

