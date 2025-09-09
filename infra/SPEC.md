# Origan Infrastructure Specification - Alchemy Implementation

## Overview

This document specifies the infrastructure implementation for Origan using the Alchemy framework, targeting deployment on a Contabo VPS running k3s with the default Traefik ingress controller.

## Scope Separation

### Host/Platform Responsibilities (NOT managed by this IaC)
- k3s cluster installation and configuration
- Traefik ingress controller (comes with k3s)
- cert-manager and Let's Encrypt setup
- MinIO server instance (platform-wide object storage)
- Monitoring stack (Prometheus, Grafana)
- Log aggregation
- Backup solutions

### Application Responsibilities (Managed by Alchemy)
- Origan services deployment (Control API, Gateway, etc.)
- Application-specific configurations
- Database for Origan (PostgreSQL)
- Message queue for Origan (NATS)
- MinIO bucket creation (not the MinIO instance itself)
- Application secrets and ConfigMaps
- Service networking and ingress rules

## Goals

- Deploy Origan application stack on existing k3s infrastructure
- Use Alchemy's TypeScript-native approach for application deployment
- Create resources assuming platform services are available
- Maintain type safety and idempotency across all resources
- Support both development and production environments

## Platform Prerequisites

Before deploying Origan with this IaC, the following must be configured on the host:

### Required Platform Services
1. **k3s cluster** - Single or multi-node cluster
2. **MinIO server** - Deployed as a platform service with:
   - Admin credentials configured
   - Service exposed at `minio.platform.svc.cluster.local:9000` (or configure MINIO_ENDPOINT)
   - Access keys available as environment variables

### Optional Platform Services (Recommended for Production)
1. **cert-manager** - For automatic TLS certificates

### Environment Variables Required
```bash
# MinIO access (platform-provided)
export MINIO_ENDPOINT="http://minio.platform.svc.cluster.local:9000"
export MINIO_ACCESS_KEY="platform-minio-key"
export MINIO_SECRET_KEY="platform-minio-secret"

# k3s access (if running outside cluster)
export K3S_API_URL="https://your-k3s-server:6443"
export K3S_TOKEN="your-k3s-token"

# Application-specific
export GITHUB_CLIENT_SECRET="..."
export GITHUB_WEBHOOK_SECRET="..."
export GITHUB_APP_PRIVATE_KEY_BASE64="..."
```

## Architecture

### Deployment Target
- **Platform**: Contabo VPS
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Orchestration**: k3s (single-node cluster)
- **Ingress**: Traefik (k3s default)
- **Container Runtime**: containerd (k3s default)

### Service Architecture

```
[Platform Layer - Pre-existing]
    ├── k3s cluster
    ├── Traefik Ingress Controller
    ├── cert-manager (optional)
    └── MinIO Server (shared instance)

[Application Layer - Managed by Alchemy]
    
Internet
    ↓
[Traefik Ingress] (uses existing)
    ├── *.app.domain → Gateway Service
    ├── api.domain → Control API
    └── admin.domain → Admin Panel
    
[Services Layer]
    ├── Gateway (ClusterIP)
    ├── Control API (ClusterIP)
    ├── Admin Panel (ClusterIP)
    └── Runner (ClusterIP)
    
[Data Layer]
    ├── PostgreSQL (StatefulSet) - Origan dedicated
    ├── MinIO Bucket (uses platform MinIO)
    └── NATS (Deployment) - Origan dedicated
```

## Alchemy Resource Structure

### Directory Layout

```
infra/
├── package.json              # Alchemy as peer dependency
├── tsconfig.json            # TypeScript configuration
├── SPEC.md                  # This document
├── src/
│   ├── index.ts            # Main entry point
│   ├── config.ts           # Environment configuration
│   ├── context.ts          # Alchemy context setup
│   ├── resources/          # Custom resource definitions
│   │   ├── k3s/           # Kubernetes resources
│   │   │   ├── api.ts     # k3s API client
│   │   │   ├── deployment.ts
│   │   │   ├── service.ts
│   │   │   ├── ingress.ts
│   │   │   ├── statefulset.ts
│   │   │   ├── configmap.ts
│   │   │   ├── secret.ts
│   │   │   ├── pvc.ts
│   │   │   └── index.ts
│   │   └── minio/         # MinIO bucket management
│   │       ├── api.ts     # MinIO API client
│   │       ├── bucket.ts  # Bucket resource
│   │       └── index.ts
│   └── deployments/       # Service deployments
│       ├── infrastructure.ts  # Base infrastructure
│       ├── control-api.ts
│       ├── gateway.ts
│       ├── admin-panel.ts
│       ├── runner.ts
│       ├── postgres.ts
│       └── nats.ts
└── environments/          # Environment-specific configs
    ├── development.ts
    └── production.ts
```

## Resource Definitions

### Base k3s Resources

#### K3sApi Client
Minimal fetch-based client for interacting with k3s API:

```typescript
// src/resources/k3s/api.ts
export class K3sApi {
  baseUrl: string;
  token: string;
  
  constructor(options: K3sApiOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.K3S_API_URL || 'https://localhost:6443';
    this.token = options.token || process.env.K3S_TOKEN || '';
  }
  
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    // Implementation with auth headers and TLS handling
  }
}
```

#### Deployment Resource

```typescript
// src/resources/k3s/deployment.ts
export interface K3sDeploymentProps {
  namespace?: string;
  replicas?: number;
  containers: ContainerSpec[];
  labels?: Record<string, string>;
  envFrom?: EnvFromSource[];
  volumes?: Volume[];
}

export interface K3sDeployment extends Resource<"k3s::Deployment">, K3sDeploymentProps {
  name: string;
  uid: string;
  createdAt: number;
  status: DeploymentStatus;
}

export const K3sDeployment = Resource(
  "k3s::Deployment",
  async function(this: Context<K3sDeployment>, name: string, props: K3sDeploymentProps): Promise<K3sDeployment> {
    // Implementation following Alchemy patterns
  }
);
```

#### Service Resource

```typescript
// src/resources/k3s/service.ts
export interface K3sServiceProps {
  namespace?: string;
  type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ports: ServicePort[];
  selector: Record<string, string>;
}

export interface K3sService extends Resource<"k3s::Service">, K3sServiceProps {
  name: string;
  clusterIP: string;
  createdAt: number;
}
```

#### Ingress Resource

```typescript
// src/resources/k3s/ingress.ts
export interface K3sIngressProps {
  namespace?: string;
  className?: string;  // 'traefik' by default
  rules: IngressRule[];
  tls?: IngressTLS[];
  annotations?: Record<string, string>;
}

export interface K3sIngress extends Resource<"k3s::Ingress">, K3sIngressProps {
  name: string;
  hosts: string[];
  createdAt: number;
}
```

### Service Deployments

#### Control API Deployment

```typescript
// src/deployments/control-api.ts
import { K3sDeployment, K3sService, K3sConfigMap, K3sSecret } from '../resources/k3s';

export async function deployControlApi(config: ControlApiConfig) {
  // Create ConfigMap for non-sensitive config
  const configMap = await K3sConfigMap('control-api-config', {
    data: {
      APP_ENV: config.environment,
      ORIGAN_DEPLOY_DOMAIN: config.deployDomain,
      BUCKET_URL: 'http://minio:9000',
      BUCKET_NAME: 'origan',
      EVENTS_NATS_SERVER: 'nats://nats:4222'
    }
  });
  
  // Create Secret for sensitive data
  const secret = await K3sSecret('control-api-secret', {
    data: {
      DATABASE_URL: alchemy.secret(config.databaseUrl),
      JWT_SECRET: alchemy.secret(config.jwtSecret),
      GITHUB_CLIENT_SECRET: alchemy.secret(config.githubClientSecret),
      GITHUB_WEBHOOK_SECRET: alchemy.secret(config.githubWebhookSecret),
      GITHUB_APP_PRIVATE_KEY_BASE64: alchemy.secret(config.githubAppPrivateKey)
    }
  });
  
  // Create Deployment
  const deployment = await K3sDeployment('control-api', {
    replicas: 2,
    containers: [{
      name: 'control-api',
      image: 'ghcr.io/origan/control-api:latest',
      ports: [{ containerPort: 9999 }],
      envFrom: [
        { configMapRef: { name: configMap.name } },
        { secretRef: { name: secret.name } }
      ],
      livenessProbe: {
        httpGet: { path: '/health', port: 9999 },
        initialDelaySeconds: 30
      }
    }]
  });
  
  // Create Service
  const service = await K3sService('control-api', {
    type: 'ClusterIP',
    ports: [{ port: 9999, targetPort: 9999 }],
    selector: { app: 'control-api' }
  });
  
  return { deployment, service, configMap, secret };
}
```

#### Gateway Deployment

```typescript
// src/deployments/gateway.ts
export async function deployGateway(config: GatewayConfig) {
  const deployment = await K3sDeployment('gateway', {
    replicas: 2,
    containers: [{
      name: 'gateway',
      image: 'ghcr.io/origan/gateway:latest',
      ports: [{ containerPort: 7777 }],
      env: [
        { name: 'ORIGAN_DEPLOY_DOMAIN', value: config.deployDomain },
        { name: 'CONTROL_API_URL', value: 'http://control-api:9999' },
        { name: 'RUNNER_URL', value: 'http://runner:8000' }
      ]
    }]
  });
  
  const service = await K3sService('gateway', {
    type: 'NodePort',
    ports: [{ port: 7777, targetPort: 7777, nodePort: 30777 }],
    selector: { app: 'gateway' }
  });
  
  // Ingress for wildcard domain routing
  const ingress = await K3sIngress('gateway', {
    rules: [{
      host: '*.app.' + config.baseDomain,
      http: {
        paths: [{
          path: '/',
          pathType: 'Prefix',
          backend: {
            service: { name: 'gateway', port: { number: 7777 } }
          }
        }]
      }
    }]
  });
  
  return { deployment, service, ingress };
}
```

### MinIO Bucket Resource

```typescript
// src/resources/minio/bucket.ts
export interface MinioBucketProps {
  region?: string;
  versioning?: boolean;
  publicRead?: boolean;
}

export interface MinioBucket extends Resource<"minio::Bucket">, MinioBucketProps {
  name: string;
  endpoint: string;
  createdAt: number;
}

export const MinioBucket = Resource(
  "minio::Bucket",
  async function(this: Context<MinioBucket>, name: string, props: MinioBucketProps): Promise<MinioBucket> {
    const minioApi = new MinioApi({
      endpoint: process.env.MINIO_ENDPOINT || 'http://minio.platform.svc.cluster.local:9000',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY
    });
    
    if (this.phase === "delete") {
      await minioApi.deleteBucket(name);
      return this.destroy();
    }
    
    // Create or ensure bucket exists
    const exists = await minioApi.bucketExists(name);
    if (!exists) {
      await minioApi.createBucket(name, props.region || 'us-east-1');
    }
    
    // Set bucket policies if needed
    if (props.publicRead) {
      await minioApi.setBucketPolicy(name, 'public-read');
    }
    
    if (props.versioning) {
      await minioApi.setBucketVersioning(name, true);
    }
    
    return this({
      name,
      endpoint: minioApi.endpoint,
      createdAt: Date.now(),
      ...props
    });
  }
);
```

### Infrastructure Services

#### PostgreSQL StatefulSet

```typescript
// src/deployments/postgres.ts
export async function deployPostgres(config: PostgresConfig) {
  const pvc = await K3sPersistentVolumeClaim('postgres-data', {
    accessModes: ['ReadWriteOnce'],
    resources: { requests: { storage: '10Gi' } }
  });
  
  const secret = await K3sSecret('postgres-secret', {
    data: {
      POSTGRES_PASSWORD: alchemy.secret(config.password),
      POSTGRES_USER: alchemy.secret('origan-root'),
      POSTGRES_DB: alchemy.secret('origan')
    }
  });
  
  const statefulSet = await K3sStatefulSet('postgres', {
    replicas: 1,
    serviceName: 'postgres',
    containers: [{
      name: 'postgres',
      image: 'postgres:16',
      ports: [{ containerPort: 5432 }],
      envFrom: [{ secretRef: { name: secret.name } }],
      volumeMounts: [{
        name: 'postgres-storage',
        mountPath: '/var/lib/postgresql/data'
      }]
    }],
    volumeClaimTemplates: [{
      metadata: { name: 'postgres-storage' },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '10Gi' } }
      }
    }]
  });
  
  const service = await K3sService('postgres', {
    type: 'ClusterIP',
    ports: [{ port: 5432, targetPort: 5432 }],
    selector: { app: 'postgres' }
  });
  
  return { statefulSet, service, secret, pvc };
}
```

## Configuration Management

### Environment Variables

```typescript
// src/config.ts
export interface EnvironmentConfig {
  environment: 'development' | 'production';
  baseDomain: string;
  deployDomain: string;
  databaseUrl: string;
  jwtSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  githubWebhookSecret: string;
  githubAppPrivateKey: string;
  githubAppId: string;
}

export function loadConfig(): EnvironmentConfig {
  return {
    environment: process.env.APP_ENV as 'development' | 'production' || 'development',
    baseDomain: process.env.BASE_DOMAIN || 'localtest.me',
    deployDomain: process.env.ORIGAN_DEPLOY_DOMAIN || 'localtest.me:7777',
    // ... other config
  };
}
```

### Main Deployment Entry Point

```typescript
// src/index.ts
import { alchemy } from 'alchemy';
import { MinioBucket } from './resources/minio';
import { deployPostgres } from './deployments/postgres';
import { deployNats } from './deployments/nats';
import { deployControlApi } from './deployments/control-api';
import { deployGateway } from './deployments/gateway';
import { deployAdminPanel } from './deployments/admin-panel';
import { deployRunner } from './deployments/runner';
import { loadConfig } from './config';

async function main() {
  const app = await alchemy('origan-k3s');
  const config = loadConfig();
  
  // Create MinIO bucket (assumes MinIO server exists on platform)
  const bucket = await MinioBucket('origan', {
    region: 'us-east-1',
    versioning: false,
    publicRead: true  // For serving static assets
  });
  
  // Deploy Origan-specific infrastructure
  const postgres = await deployPostgres(config);
  const nats = await deployNats(config);
  
  // Deploy application services
  const controlApi = await deployControlApi({
    ...config,
    bucketName: bucket.name,
    bucketEndpoint: bucket.endpoint
  });
  const gateway = await deployGateway(config);
  const adminPanel = await deployAdminPanel(config);
  const runner = await deployRunner(config);
  
  await app.finalize();
  
  console.log('Deployment complete!');
  console.log(`Gateway: http://${config.baseDomain}`);
  console.log(`Control API: http://api.${config.baseDomain}`);
  console.log(`Admin Panel: http://admin.${config.baseDomain}`);
}

main().catch(console.error);
```

## Deployment Phases

### Phase 1: Development Environment
1. Deploy with `.localtest.me` domain (resolves to 127.0.0.1)
2. Use NodePort services for external access
3. Single replica for each service
4. No TLS certificates (HTTP only or self-signed)

### Phase 2: Production Setup
1. Configure real domain
2. Add Let's Encrypt certificates via cert-manager
3. Scale replicas based on load
4. Configure resource limits and requests
5. Add monitoring and logging

### Phase 3: Production TLS Setup

For production deployments with TLS:
1. Platform administrator installs cert-manager on the k3s cluster
2. Platform administrator creates ClusterIssuer for Let's Encrypt
3. Application Ingress resources can then reference the ClusterIssuer via annotations:

```typescript
// In application deployment
const ingress = await K3sIngress('gateway', {
  annotations: {
    'cert-manager.io/cluster-issuer': 'letsencrypt-prod'  // References platform's ClusterIssuer
  },
  rules: [...],
  tls: [{
    hosts: ['*.app.example.com'],
    secretName: 'gateway-tls'  // cert-manager will populate this
  }]
});
```

## Implementation Notes

### Alchemy Patterns to Follow
1. Use `Resource()` wrapper for all resources
2. Implement pseudo-class pattern (interface name matches exported const)
3. Use `this: Context<T>` for resource context
4. Handle create/update/delete phases properly
5. Use raw fetch instead of k8s client libraries
6. Make all resources idempotent
7. Use `alchemy.secret()` for sensitive data

### k3s API Authentication
- Option 1: Use kubeconfig from `/etc/rancher/k3s/k3s.yaml`
- Option 2: Use service account token for in-cluster access
- Option 3: Configure external access with generated tokens

### Resource Dependencies
Ensure proper ordering:
1. Infrastructure (PostgreSQL, MinIO, NATS)
2. Control API (depends on PostgreSQL)
3. Gateway (depends on Control API)
4. Admin Panel & Runner (can deploy in parallel)

### Error Handling
- Check k3s API response status directly
- Log errors with context
- Implement retry logic for transient failures
- Handle resource conflicts gracefully

## Testing Strategy

### Local Development
1. Use k3d or kind for local k3s cluster
2. Test with `.localtest.me` domain
3. Validate resource creation/updates/deletion
4. Test rollback scenarios

### Staging Environment
1. Deploy to test VPS
2. Use Let's Encrypt staging certificates
3. Validate full deployment pipeline
4. Load testing with realistic traffic

## Migration from Docker Compose

### Services Migration Strategy

#### Application Services (Migrate to k3s)
- ✅ Control API → Deployment
- ✅ Gateway → Deployment  
- ✅ Admin Panel → Deployment
- ✅ Runner → Deployment
- ✅ PostgreSQL → StatefulSet (Origan-specific instance)
- ✅ NATS → Deployment (Origan-specific instance)

#### Platform Services (Install once on host)
- ❌ MinIO → Use platform-wide MinIO, only create bucket
- ❌ Traefik → Already included in k3s
- ✅ Smee webhook proxy → Optional, can deploy as needed

### Configuration Migration
- Environment variables → ConfigMaps and Secrets
- Docker volumes → PersistentVolumeClaims (for PostgreSQL)
- Docker networks → k3s cluster networking
- Port mappings → Services (ClusterIP) and Ingress rules
- MinIO data → Bucket on platform MinIO instance

## Next Steps

1. **Setup Alchemy Project**
   - Initialize package.json with Alchemy
   - Configure TypeScript
   - Set up build scripts

2. **Implement Core Resources**
   - Create k3s API client
   - Implement basic k8s resources
   - Test resource CRUD operations

3. **Deploy Infrastructure**
   - PostgreSQL StatefulSet
   - MinIO object storage
   - NATS messaging

4. **Deploy Applications**
   - Control API with migrations
   - Gateway with routing
   - Admin Panel
   - Runner

5. **Configure Ingress**
   - Set up domain routing
   - Add TLS certificates (production)
   - Test end-to-end connectivity

## Questions to Address

1. **Container Registry**: Use GitHub Container Registry (ghcr.io) or deploy private registry?
2. **Secrets Management**: Use k3s secrets or external solution (Vault, etc.)?
3. **Backup Strategy**: How to handle PostgreSQL and MinIO backups?
4. **Monitoring**: Prometheus/Grafana stack or external solution?
5. **CI/CD**: GitHub Actions for building and pushing images?