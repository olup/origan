# Origan

Origan is a platform for deploying full stack web apps.

## Packages

### CLI (`packages/cli`)

The command line interface for Origan. This is the main tool for developers to interact with the platform. See the CLI package documentation for detailed usage instructions.

### Control API (`packages/control-api`)

The backend service that manages:
- Project configurations
- Deployments
- Authentication and authorization
- Database interactions (using Drizzle ORM)

### Gateway (`packages/gateway`)

Edge proxy service responsible for:
- Request routing
- HTTPS/TLS certificate management (ACME)
- Static file serving
- Health checks
- API proxying

### Runner (`packages/runner`)

Edge functions runtime environment:
- Function supervision and lifecycle management
- Edge runtime environment
- Worker process management

### Admin Panel (`packages/admin-panel`)

Web interface for platform administration built with:
- React
- Vite
- TypeScript

## Development

### Prerequisites

- Node.js 22+
- pnpm
- Docker and Docker Compose

### Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Make sure you have a .env file in the root directory following the `.env.example` template. This file contains secret mainly coming from the development Github app. Up-to-date env file can be obtained from the dev team.

3. Install [Tilt](https://github.com/tilt-dev/tilt?tab=readme-ov-file#install-tilt) to run the local development environment. Compared to a bare `docker-compose`, Tilt reloads your environment when you modify your `docker-compose.yaml` file, rebuild your images when you've changed a file, while also allowing for live-update by syncing changed files directly to the container and triggering a command when some file changes (e.g. `pnpm install` when `package.json` changes).

4. Run the development environment:
```bash
tilt up
```

### Local development and github webhooks
To authenticate or act in a user repo, we use github apps, created in the Origan organization. The app is installed on the user repo, and we use the JWT token to authenticate and act on behalf of the user.
- [Production app](https://github.com/organizations/origan-eu/settings/apps/origaneu)
- [Development app](https://github.com/organizations/origan-eu/settings/apps/origaneu-local) (to use in local dev env)

The Developmment app is already setup to send its webhooks to smee.io, a webhook relay service by and for github. We use [this enpoint](https://smee.io/origaneulocal-8MVxlEzBDRVUKj) to receive, proxy, examine and replay webhooks.

When developping, the smee client is started in the docker-compose file, that connects to our endpoint and proxies incoming or replayed webhooks to our control api service.

Except for setting the main .env file, there is nothing more required of the developer.

### CLI Development

To develop the CLI locally:

1. Build the CLI in watch mode:
```bash
cd packages/cli
pnpm build:watch
```

  If you already have `tilt up` running, the `cli` is automatically rebuilt in it as well.

2. Make the CLI available globally:
```bash
cd packages/cli && pnpm link -g
```

This will allow you to use the `origan` command globally while developing. The CLI will automatically rebuild when you make changes to the source code.

To uninstall the CLI, run:
```bash
pnpm uninstall -g @origan/cli
```

### Project Structure

```
origan/
├── packages/
│   ├── cli/           # Command line interface
│   ├── control-api/   # Backend service
│   ├── gateway/       # Edge proxy
│   ├── runner/        # Function runtime
│   └── admin-panel/   # Admin interface
├── infra/             # Infrastructure code
└── docker-compose.yml # Local development services
```

### Infrastructure

The `infra/` directory contains Pulumi infrastructure as code for:
- Kubernetes clusters
- Databases
- Object storage
- Container registry
- API Gateway configuration
