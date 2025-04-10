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

2. Start the development environment:
```bash
docker-compose up    # Start supporting services
```

### CLI Development

To develop the CLI locally:

1. Build the CLI in watch mode:
```bash
cd packages/cli
pnpm build:watch
```

2. Make the CLI available globally:
```bash
cd packages/cli
pnpm link
```

This will allow you to use the `origan` command globally while developing. The CLI will automatically rebuild when you make changes to the source code.

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