# Infrastructure

This directory contains the Pulumi infrastructure as code (IaC) for the Origan platform. It manages all cloud resources and configurations required to run the platform.

## Components

### Kubernetes Cluster (`components/kubernetes.ts`)
- Manages the main Kubernetes cluster
- Configures node pools and scaling
- Sets up networking and security policies

### Database (`components/database.ts`)
- Manages PostgreSQL database instances
- Configures backups and replication
- Handles connection security

### Object Storage (`components/bucket.ts`)
- S3-compatible object storage
- Static file hosting
- Build artifacts storage

### Container Registry (`components/registry.ts`)
- Private container registry
- Image hosting and management
- Access control and security

### API Gateway (`components/gateway.ts`)
- Edge routing configuration
- HTTPS/TLS certificate management
- Request handling and proxying

### Build Runner (`components/build-runner.ts`)
- Build service deployment
- Auto-scaling configuration
- Resource allocation

### Control API (`components/control.ts`)
- Backend API deployment
- Service configuration
- Database integration

### Function Runtime (`components/runner.ts`)
- Edge function runtime environment
- Worker process management
- Resource isolation

## Environment Configuration

The infrastructure supports multiple environments through Pulumi stacks:

- Development: Local development environment
- Staging: Testing and QA environment
- Production: Live environment

Configure environments using stack-specific YAML files:
```bash
pulumi stack select <environment>
pulumi config set <key> <value>
```

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/)
- Node.js 22+
- Cloud provider credentials properly configured
- `pnpm` package manager

## Development

1. Install dependencies:
```bash
pnpm install
```

2. Select stack:
```bash
pulumi stack select dev
```

3. Configure variables:
```bash
pulumi config set aws:region eu-west-1
```

4. Preview changes:
```bash
pulumi preview
```

5. Deploy:
```bash
pulumi up
```

## Architecture

```
┌──────────────┐
│ API Gateway  │
└──────┬───────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐
│ Control API  │◄───┤   Database   │
└──────┬───────┘    └──────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐
│Build Runner  │◄───┤Object Storage│
└──────┬───────┘    └──────────────┘
       │
       ▼
┌──────────────┐
│Edge Runtime  │
└──────────────┘
```

## Common Operations

### Adding New Resources
1. Create new component in `src/components/`
2. Define resource configuration
3. Export resources for use in other components
4. Import and use in `index.ts`

### Updating Configurations
1. Modify relevant stack config
2. Preview changes with `pulumi preview`
3. Apply with `pulumi up`

### Troubleshooting
1. Check Pulumi logs: `pulumi logs`
2. Verify cloud provider console
3. Review component configurations
4. Check network policies and security groups