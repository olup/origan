# Origan Infrastructure with Pulumi

This directory contains the Pulumi infrastructure as code for the Origan platform.

## Architecture

The infrastructure consists of:

### Core Infrastructure
- **Kubernetes Namespace**: Isolated environment for Origan resources
- **PostgreSQL Database**: Stateful database for application data
- **NATS with JetStream**: Message broker for event-driven architecture
- **S3/Garage Storage**: Object storage for deployments and static sites

### Application Services
- **Control API**: Main API service for the platform
- **Gateway**: Reverse proxy for user deployments
- **Builder**: Container image for running build jobs
- **Runner**: Edge runtime for executing user functions (optional)

### Static Sites
- **Admin Panel**: Management interface
- **Landing Page**: Public website

## Prerequisites

1. Install Pulumi CLI:
```bash
curl -fsSL https://get.pulumi.com | sh
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your values
```

## Deployment

### Initialize Stack

Create a new stack for your environment:

```bash
pulumi stack init dev
```

### Configure Stack

Set configuration values:

```bash
# Set PostgreSQL password
pulumi config set --secret origan:postgresPassword yourSecurePassword

# Set Garage credentials
pulumi config set --secret origan:garageAccessKey yourAccessKey
pulumi config set --secret origan:garageSecretKey yourSecretKey

# Set other configuration
pulumi config set origan:environment dev
pulumi config set origan:domainName origan.dev
pulumi config set origan:garageEndpoint https://s3.platform.origan.dev
```

#### Testing Alongside Existing Deployment

To deploy a test instance alongside an existing deployment without conflicts:

```bash
# Use a different namespace prefix (default: origan-pulumi)
pulumi config set origan:namespacePrefix origan-test

# This will create:
# - Namespace: origan-test-dev (instead of origan-dev)
# - No conflicts with existing origan-dev namespace
```

To deploy alongside the existing Alchemy deployment:
1. Keep the default `namespacePrefix` as "origan-pulumi" (avoids conflict with "origan")
2. Deploy normally - resources will be isolated in the new namespace
3. Services will use the same domain names but be served from the new namespace

### Deploy Infrastructure

Preview changes:
```bash
pulumi preview
```

Deploy:
```bash
pulumi up
```

### Stack Outputs

After deployment, view outputs:
```bash
pulumi stack output
```

Key outputs:
- `infrastructure.services.controlApi.url` - Control API endpoint
- `infrastructure.staticSites.admin.url` - Admin panel URL
- `infrastructure.services.gateway.wildcardDomain` - User app domain pattern

## Managing Multiple Environments

### Create Production Stack

```bash
pulumi stack init prod
pulumi config set origan:environment prod
pulumi config set origan:domainName origan.dev
# Set production secrets...
```

### Switch Between Stacks

```bash
pulumi stack select dev
pulumi stack select prod
```

### List Stacks

```bash
pulumi stack ls
```

## Custom Resources

### Static Site Uploader

The `StaticSiteUploader` is a custom Pulumi dynamic provider that:
- Uploads static files to S3/Garage buckets
- Calculates content hashes for change detection
- Sets appropriate cache headers
- Optionally deletes orphaned files

Usage:
```typescript
const siteUpload = new StaticSiteUploader("my-site", {
  bucketName: myBucket.bucket,
  sourcePath: "./dist",
  bucketEndpoint: garageEndpoint,
  invalidateOnChange: true,
  deleteOrphaned: true,
});
```

## Troubleshooting

### View Logs

```bash
pulumi logs --follow
```

### Destroy Infrastructure

```bash
pulumi destroy
```

### Export Stack State

```bash
pulumi stack export > stack-backup.json
```

### Import Stack State

```bash
pulumi stack import < stack-backup.json
```

## Migration from Alchemy

This Pulumi setup replaces the previous Alchemy infrastructure. Key differences:

1. **State Management**: Pulumi uses a proper state backend (local file, S3, or Pulumi Cloud)
2. **Type Safety**: Full TypeScript support with autocomplete
3. **Preview**: `pulumi preview` shows changes before applying
4. **Secrets**: Built-in secret encryption
5. **Outputs**: Structured exports for integration

To migrate:
1. Deploy Pulumi infrastructure to a new namespace
2. Migrate data (database, storage)
3. Update DNS records
4. Decommission Alchemy resources

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Infrastructure
on:
  push:
    branches: [main]
    paths:
      - 'infra-pulumi/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pulumi/actions@v4
        with:
          command: up
          stack-name: prod
          work-dir: ./infra-pulumi
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

## Resources

- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Pulumi Kubernetes Provider](https://www.pulumi.com/registry/packages/kubernetes/)
- [Pulumi Docker Provider](https://www.pulumi.com/registry/packages/docker/)
- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)