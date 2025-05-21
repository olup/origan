# Origan

Origan is a platform for deploying full stack web applications in Europe. Think Vercel, Netlify, or Cloudflare Pages, but European-based and focused on developer experience.

## Key Features

- **Full-Stack Deployment**: Deploy both frontend assets and backend functions
- **Zero Configuration**: Automatic detection of project type and build settings
- **European Infrastructure**: All services hosted in EU data centers
- **GitHub Integration**: Seamless deployment from GitHub repositories
- **Custom Domains**: Support for custom domains with automatic SSL
- **Real-Time Logs**: Live build and deployment logs
- **Team Collaboration**: Multi-user support with role-based access

## Packages

### CLI (`packages/cli`)
Command line interface for developers:
- Project initialization
- Local development
- Deployment management
- Configuration handling

### Control API (`packages/control-api`)
Backend service managing:
- Project configurations
- Deployments and builds
- Authentication and authorization
- Database operations (Drizzle ORM)
- GitHub integration

### Gateway (`packages/gateway`)
Edge proxy service handling:
- Request routing
- HTTPS/TLS certificates (ACME)
- Static file serving
- Health monitoring
- API proxying

### Runner (`packages/runner`)
Edge functions runtime:
- Function supervision
- Edge runtime environment
- Worker process management
- Resource isolation

### Admin Panel (`packages/admin-panel`)
Web interface built with:
- React & Vite
- TypeScript
- Real-time updates
- Project management

### Landing Page (`packages/landing`)
Marketing site featuring:
- Product information
- Documentation
- Pricing
- Blog

### Shared Libraries
- `shared/nats`: NATS messaging client for service communication

## Development

### Prerequisites

- Node.js 22+
- pnpm
- Docker and Docker Compose
- [Tilt](https://github.com/tilt-dev/tilt?tab=readme-ov-file#install-tilt)

### Getting Started

1. Clone and install dependencies:
```bash
git clone https://github.com/origan-eu/origan.git
cd origan
pnpm install
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your GitHub App credentials
```

3. Start development environment:
```bash
tilt up
```

### GitHub Integration

Origan uses GitHub Apps for repository access:
- [Production App](https://github.com/organizations/origan-eu/settings/apps/origaneu)
- [Development App](https://github.com/organizations/origan-eu/settings/apps/origaneu-local)

Development webhooks are handled through [smee.io](https://smee.io/origaneulocal-8MVxlEzBDRVUKj).

### CLI Development

To use the CLI locally while developing:

```bash
cd packages/cli && pnpm link -g
```

The CLI is automatically built as part of the Tilt environment. To remove the global link when done:
```bash
pnpm uninstall -g @origan/cli
```

## Architecture

```
┌─────────────┐
│    CLI      │
└─────┬───────┘
      │
┌─────▼───────┐    ┌──────────────┐
│   Gateway   │◄───┤  Admin Panel │
└─────┬───────┘    └──────────────┘
      │
┌─────▼───────┐    ┌──────────────┐
│ Control API │◄───┤   Database   │
└─────┬───────┘    └──────────────┘
      │
┌─────▼───────┐    ┌──────────────┐
│Build Runner │◄───┤Object Storage│
└─────┬───────┘    └──────────────┘
      │
┌─────▼───────┐
│Edge Runtime │
└─────────────┘
```

## Infrastructure

The `infra/` directory contains Pulumi IaC for:
- Kubernetes clusters
- Databases
- Object storage
- Container registry
- API Gateway configuration

See [infra/README.md](infra/README.md) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Copyright © 2024 Origan EU
