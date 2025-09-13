# Caching Strategy Specification

## Overview

This document outlines a unified caching strategy for Origan to improve performance, reduce latency, and minimize redundant calls between services. The strategy introduces a shared DragonflyDB cache (Redis-compatible but 25x faster) accessible by all services (Gateway, Runner, Control API).

## Current State Analysis

### Existing Caching Mechanisms

1. **Gateway Service**
   - **LRU Memory Cache**: Deployment configurations (`packages/gateway/src/services/configurations.ts`)
     - TTL: 5 minutes
     - Size: 1000 entries max
   - **LRU Memory Cache**: Static files (`packages/gateway/src/handlers/static.ts`)
     - Size: 500MB max
     - No TTL (deployments are immutable)

2. **Runner Service**
   - **Disk Cache**: Function code files
     - Location: `${WORKERS_PATH}/${projectId}/${deploymentId}/${queryHash}/`
     - Cleanup: After 30 minutes of inactivity
   - **No Cache**: Deployment metadata (fetched from S3 on every request)

3. **Control API**
   - No caching layer currently implemented

### Performance Issues

1. **Runner Cold Starts**
   - S3 fetch for metadata.json on every cold start
   - S3 fetch for function code (if not in disk cache)
   - Environment variables parsed on every request

2. **Gateway Overhead**
   - Control API call for every domain lookup (even for same deployment)
   - No sharing of cache between multiple gateway instances

3. **Control API Load**
   - Database queries for every deployment config request
   - GitHub token generation without caching
   - Permission checks without caching

## Proposed Solution

### Infrastructure Addition

Add **DragonflyDB** as a shared caching layer. DragonflyDB is a drop-in Redis replacement that offers:
- **25x better performance** than Redis on multi-core systems
- **80% less memory usage** for the same dataset
- **Snapshot without performance impact** (no fork, no memory spike)
- **100% Redis API compatibility** (no code changes needed)
- **Vertical scaling** with multi-threading support

#### Production Deployment (Kubernetes/Docker)

```yaml
# docker-compose.yml for production
services:
  cache:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    ports:
      - "6379:6379"
    volumes:
      - cache_data:/data
    environment:
      - DRAGONFLY_MAXMEMORY=2gb
      - DRAGONFLY_SNAPSHOT_CRON="*/30 * * * *"  # Snapshot every 30 minutes
    command: [
      "dragonfly",
      "--logtostderr",
      "--dir=/data",
      "--bind=0.0.0.0",
      "--protected-mode=no",  # Within secure network
      "--dbfilename=dump.rdb"
    ]
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'  # DragonflyDB scales with cores
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  cache_data:
    driver: local
```

#### Local Development Setup

```yaml
# docker-compose.dev.yml for local development
services:
  cache:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    ports:
      - "6379:6379"
    command: [
      "dragonfly",
      "--logtostderr",
      "--maxmemory=512mb"  # Less memory for local dev
    ]
    networks:
      - origan-network
```

For local development without Docker:
```bash
# Install DragonflyDB locally (macOS)
brew install dragonflydb/tap/dragonfly

# Run locally
dragonfly --logtostderr --maxmemory=512mb
```

#### Infrastructure as Code (Pulumi)

```typescript
// infra/src/resources/cache/dragonfly.ts
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function createDragonflyCache(
  name: string,
  namespace: string,
  config: {
    memoryLimit?: string;
    cpuLimit?: string;
    persistence?: boolean;
  } = {}
) {
  const {
    memoryLimit = "2Gi",
    cpuLimit = "2",
    persistence = true
  } = config;

  // PersistentVolumeClaim for data persistence
  const pvc = persistence ? new k8s.core.v1.PersistentVolumeClaim(`${name}-pvc`, {
    metadata: {
      name: `${name}-data`,
      namespace,
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      resources: {
        requests: {
          storage: "10Gi",
        },
      },
    },
  }) : undefined;

  // ConfigMap for DragonflyDB configuration
  const configMap = new k8s.core.v1.ConfigMap(`${name}-config`, {
    metadata: {
      name: `${name}-config`,
      namespace,
    },
    data: {
      "dragonfly.conf": `
        # DragonflyDB Configuration
        bind 0.0.0.0
        protected-mode no
        maxmemory ${memoryLimit}
        maxmemory-policy allkeys-lru
        
        # Persistence
        dir /data
        dbfilename dump.rdb
        
        # Performance
        tcp-keepalive 300
        tcp-backlog 511
        
        # Logging
        loglevel notice
      `,
    },
  });

  // StatefulSet for DragonflyDB
  const statefulSet = new k8s.apps.v1.StatefulSet(`${name}-statefulset`, {
    metadata: {
      name,
      namespace,
    },
    spec: {
      serviceName: name,
      replicas: 1,
      selector: {
        matchLabels: {
          app: name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: name,
          },
        },
        spec: {
          containers: [{
            name: "dragonfly",
            image: "docker.dragonflydb.io/dragonflydb/dragonfly:latest",
            command: [
              "dragonfly",
              "--logtostderr",
              "--conf=/etc/dragonfly/dragonfly.conf"
            ],
            ports: [{
              containerPort: 6379,
              name: "redis",
            }],
            resources: {
              limits: {
                memory: memoryLimit,
                cpu: cpuLimit,
              },
              requests: {
                memory: "1Gi",
                cpu: "500m",
              },
            },
            volumeMounts: [
              {
                name: "config",
                mountPath: "/etc/dragonfly",
              },
              ...(persistence ? [{
                name: "data",
                mountPath: "/data",
              }] : []),
            ],
            livenessProbe: {
              exec: {
                command: ["redis-cli", "ping"],
              },
              initialDelaySeconds: 30,
              periodSeconds: 10,
            },
            readinessProbe: {
              exec: {
                command: ["redis-cli", "ping"],
              },
              initialDelaySeconds: 5,
              periodSeconds: 5,
            },
          }],
          volumes: [
            {
              name: "config",
              configMap: {
                name: configMap.metadata.name,
              },
            },
            ...(persistence && pvc ? [{
              name: "data",
              persistentVolumeClaim: {
                claimName: pvc.metadata.name,
              },
            }] : []),
          ],
        },
      },
    },
  });

  // Service to expose DragonflyDB
  const service = new k8s.core.v1.Service(`${name}-service`, {
    metadata: {
      name,
      namespace,
    },
    spec: {
      selector: {
        app: name,
      },
      ports: [{
        port: 6379,
        targetPort: 6379,
        name: "redis",
      }],
      type: "ClusterIP",
    },
  });

  return {
    statefulSet,
    service,
    endpoint: pulumi.interpolate`${service.metadata.name}.${namespace}.svc.cluster.local:6379`,
  };
}

// Usage in main infrastructure
const cache = createDragonflyCache("origan-cache", "default", {
  memoryLimit: "4Gi",
  cpuLimit: "4",
  persistence: true,
});

// Export for other services to use
export const cacheEndpoint = cache.endpoint;
```

#### Environment Configuration

```bash
# .env for local development
CACHE_URL=localhost:6379
CACHE_ENABLED=true
CACHE_TTL_DEFAULT=300
CACHE_MAX_RETRIES=3

# Production environment variables
CACHE_URL=origan-cache.default.svc.cluster.local:6379
CACHE_ENABLED=true
CACHE_TTL_DEFAULT=300
CACHE_MAX_RETRIES=3
CACHE_CONNECTION_POOL_SIZE=10
CACHE_TIMEOUT_MS=100
```

### Cache Key Strategy

#### Immutable Data (No TTL or Long TTL)

```typescript
// Deployment configurations (never change after deployment)
`deployment:${deploymentId}:config` → DeploymentConfig
`deployment:${deploymentId}:metadata` → { environmentVariables, projectId, ... }
`deployment:${deploymentId}:exists` → boolean (quick existence check)

// Domain mappings (change only on new deployments)
`domain:${domainName}` → { deploymentId, projectId, config }
```

#### Mutable Data (Short TTL)

```typescript
// GitHub tokens (1 hour TTL - match GitHub's token expiry)
`github:token:${installationId}:${repoId}` → string

// User permissions (5 minute TTL)
`user:${userId}:projects` → string[] (project IDs)
`user:${userId}:orgs` → string[] (organization IDs)

// Project data (10 minute TTL)
`project:${projectId}:config` → ProjectConfig
`project:${projectId}:environments` → Environment[]
```

#### Build/Deploy State (Temporary)

```typescript
// Build status (2 hour TTL)
`build:${buildId}:status` → BuildStatus
`build:${buildId}:logs` → string[]

// Deployment locks (5 minute TTL)
`deploy:lock:${projectId}:${trackName}` → deploymentId
```

### Implementation Plan

#### Phase 1: Core Infrastructure (Week 1)

1. **Add DragonflyDB to infrastructure**
   - Deploy DragonflyDB container (local and production)
   - Configure persistence and snapshots
   - Set up connection pooling
   - Add to Pulumi infrastructure code

2. **Create cache client library**
   ```typescript
   // packages/shared/cache/client.ts
   import { createClient, type RedisClientType } from 'redis';
   
   export interface CacheConfig {
     url: string;
     enabledCache?: boolean;
     defaultTTL?: number;
     maxRetries?: number;
     connectionPoolSize?: number;
     timeout?: number;
   }
   
   export class CacheClient {
     private client: RedisClientType;
     private config: CacheConfig;
     
     constructor(config: CacheConfig) {
       this.config = config;
       this.client = createClient({
         url: config.url,
         socket: {
           connectTimeout: config.timeout || 100,
           reconnectStrategy: (retries) => {
             if (retries > (config.maxRetries || 3)) {
               return new Error('Max retries reached');
             }
             return Math.min(retries * 100, 3000);
           }
         }
       });
       
       this.client.on('error', (err) => {
         console.error('Cache Client Error:', err);
       });
     }
     
     async connect(): Promise<void> {
       if (!this.config.enabledCache) return;
       await this.client.connect();
     }
     
     async get<T>(key: string): Promise<T | null> {
       if (!this.config.enabledCache) return null;
       try {
         const value = await this.client.get(key);
         return value ? JSON.parse(value) : null;
       } catch (error) {
         console.warn(`Cache get failed for ${key}:`, error);
         return null;
       }
     }
     
     async set(key: string, value: any, ttl?: number): Promise<void> {
       if (!this.config.enabledCache) return;
       try {
         const serialized = JSON.stringify(value);
         if (ttl) {
           await this.client.setEx(key, ttl, serialized);
         } else {
           await this.client.set(key, serialized);
         }
       } catch (error) {
         console.warn(`Cache set failed for ${key}:`, error);
       }
     }
     
     async del(key: string | string[]): Promise<void> {
       if (!this.config.enabledCache) return;
       try {
         await this.client.del(key);
       } catch (error) {
         console.warn(`Cache delete failed for ${key}:`, error);
       }
     }
     
     async exists(key: string): Promise<boolean> {
       if (!this.config.enabledCache) return false;
       try {
         return (await this.client.exists(key)) > 0;
       } catch (error) {
         console.warn(`Cache exists check failed for ${key}:`, error);
         return false;
       }
     }
     
     async disconnect(): Promise<void> {
       await this.client.quit();
     }
   }
   ```

3. **Local development setup**
   ```bash
   # Add to package.json scripts
   "dev:cache": "docker run -d -p 6379:6379 docker.dragonflydb.io/dragonflydb/dragonfly --maxmemory=512mb",
   "dev:cache:stop": "docker stop $(docker ps -q --filter ancestor=docker.dragonflydb.io/dragonflydb/dragonfly)"
   ```

4. **Add cache configuration to services**
   - Environment variables for cache connection
   - Feature flag to enable/disable cache
   - Graceful degradation when cache is unavailable

#### Phase 2: Runner Optimization (Week 2)

1. **Cache deployment metadata**
   ```typescript
   // Before: Fetch from S3 every time
   const metadata = await getFromS3(`deployments/${deploymentId}/metadata.json`)
   
   // After: Check cache first
   const cached = await cache.get(`deployment:${deploymentId}:metadata`)
   if (!cached) {
     const metadata = await getFromS3(`deployments/${deploymentId}/metadata.json`)
     await cache.set(`deployment:${deploymentId}:metadata`, metadata)
   }
   ```

2. **Cache function code references**
   - Store S3 paths and checksums
   - Validate disk cache using Redis metadata

#### Phase 3: Gateway Optimization (Week 2)

1. **Cache domain → deployment mappings**
   ```typescript
   // Before: Call control API every time
   const config = await trpc.deployments.getConfig.query({ domain })
   
   // After: Check cache first
   const cached = await cache.get(`domain:${domain}`)
   if (!cached) {
     const config = await trpc.deployments.getConfig.query({ domain })
     await cache.set(`domain:${domain}`, config, 300) // 5 min TTL
   }
   ```

2. **Share cache between gateway instances**
   - Remove in-memory LRU cache for configs
   - Keep in-memory cache for static files (large data)

#### Phase 4: Control API Optimization (Week 3)

1. **Cache GitHub tokens**
   ```typescript
   const cacheKey = `github:token:${installationId}:${repoId}`
   let token = await cache.get(cacheKey)
   if (!token) {
     token = await generateGitHubToken(installationId, repoId)
     await cache.set(cacheKey, token, 3600) // 1 hour
   }
   ```

2. **Cache user permissions**
   - Cache project memberships
   - Cache organization memberships
   - Invalidate on permission changes

#### Phase 5: Monitoring & Optimization (Week 4)

1. **Add cache metrics**
   - Hit/miss ratios per key pattern
   - Cache size and memory usage
   - Latency measurements

2. **Implement cache warming**
   - Pre-load hot deployments on service start
   - Background refresh for expiring entries

3. **Add cache management endpoints**
   - Clear cache for specific deployment
   - View cache statistics
   - Manual cache warming

### Cache Invalidation Strategy

#### Automatic Invalidation

1. **On new deployment**
   ```typescript
   // When deployment succeeds
   await cache.del(`domain:${domainName}`)
   await cache.set(`deployment:${deploymentId}:config`, config)
   await cache.set(`deployment:${deploymentId}:metadata`, metadata)
   ```

2. **On deployment deletion**
   ```typescript
   await cache.del(`deployment:${deploymentId}:*`)
   await cache.del(`domain:${domainName}`)
   ```

3. **On environment variable update**
   ```typescript
   // Environments are immutable per deployment
   // New deployment required for env changes
   // No invalidation needed
   ```

#### Manual Invalidation

- Admin API endpoints for cache management
- CLI commands for debugging
- Automatic cleanup for orphaned entries

### Fallback Strategy

All cache operations must handle failures gracefully:

```typescript
async function getWithFallback<T>(
  key: string, 
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  try {
    // Try cache first
    const cached = await cache.get<T>(key)
    if (cached) return cached
  } catch (error) {
    console.warn(`Cache get failed for ${key}:`, error)
  }
  
  // Fallback to source
  const data = await fetchFn()
  
  // Try to cache (don't fail if cache is down)
  try {
    await cache.set(key, data, ttl)
  } catch (error) {
    console.warn(`Cache set failed for ${key}:`, error)
  }
  
  return data
}
```

### Security Considerations

1. **No sensitive data in cache keys**
   - Use IDs, not user data
   - Hash sensitive identifiers if needed

2. **Encryption at rest**
   - Enable Redis persistence encryption
   - Use encrypted volumes

3. **Network isolation**
   - Redis only accessible within cluster
   - No external access

4. **Access control**
   - Use Redis ACLs if available
   - Separate users per service

### Performance Targets

#### Expected Improvements with DragonflyDB

| Metric | Current | Target (Redis) | Target (DragonflyDB) | Improvement |
|--------|---------|----------------|----------------------|-------------|
| Runner cold start | 200-500ms | 50-100ms | 20-50ms | 90% reduction |
| Gateway domain lookup | 50-100ms | 5-10ms | 1-3ms | 97% reduction |
| Control API config fetch | 20-50ms | 2-5ms | 0.5-2ms | 96% reduction |
| Overall p99 latency | 800ms | 200ms | 100ms | 87.5% reduction |
| Cache operations/sec | N/A | 10,000 | 250,000 | 25x Redis |
| Memory usage (same data) | N/A | 2GB | 400MB | 80% less |

#### DragonflyDB Performance Characteristics

- **Latency**: < 1ms for cache operations (5x better than Redis)
- **Throughput**: > 250,000 ops/second on 2 cores
- **Availability**: 99.9% uptime
- **Memory**: 400MB for same dataset that uses 2GB in Redis
- **CPU Scaling**: Near-linear scaling with cores (2 cores = 2x performance)
- **Snapshot Impact**: < 1% performance impact during snapshots (vs 50% in Redis)

### Migration Strategy

1. **Deploy cache infrastructure** (No service changes)
2. **Add cache client to shared packages**
3. **Implement caching service by service**
   - Start with Runner (biggest impact)
   - Then Gateway
   - Finally Control API
4. **Monitor and optimize**
5. **Deprecate service-specific caches**

### Monitoring & Alerts

#### Metrics to Track

```typescript
// Cache health
cache.connectivity
cache.latency.p50/p95/p99
cache.memory.used/limit
cache.evictions.count

// Cache effectiveness
cache.hit.ratio
cache.miss.count
cache.set.failures
cache.get.failures

// Per-service metrics
service.cache.hits{service="runner",key_type="metadata"}
service.cache.misses{service="gateway",key_type="domain"}
```

#### Alerts

- Cache memory > 80% capacity
- Cache latency p99 > 10ms
- Cache hit ratio < 80% (after warm-up)
- Cache connection failures
- Excessive evictions

### Cost Analysis

#### Infrastructure Costs

##### DragonflyDB vs Redis Comparison

| Resource | Redis | DragonflyDB | Savings |
|----------|-------|-------------|---------|
| Memory needed (same data) | 2GB | 400MB | 80% |
| CPU cores needed | 1 (single-threaded) | 2 (multi-threaded) | Better utilization |
| Instance cost/month | ~$50-100 (2GB) | ~$20-40 (512MB) | 60% |
| Backup storage | ~$5/month | ~$2/month | 60% |
| Network transfer | Minimal | Minimal | Same |

##### Local Development Costs
- **Docker resources**: 512MB RAM (vs 2GB for Redis)
- **Native installation**: Free (homebrew/apt)
- **Development time**: Same (Redis-compatible API)

#### Operational Savings

- **Reduced S3 API calls**: ~$10-20/month
- **Reduced database load**: Better scaling, delayed upgrade needs
- **Lower memory requirements**: Can run more services on same hardware
- **Better performance**: Handle more users with same infrastructure

#### Performance ROI

- **User Experience**: 87.5% latency reduction
- **Capacity**: Handle 25x more cache operations
- **Reliability**: No performance degradation during snapshots
- **Scale**: Defer infrastructure upgrades due to efficiency

**Total ROI**: 
- **Cost savings**: ~$40-60/month (40-60% reduction)
- **Performance gains**: 25x throughput, 87.5% latency reduction
- **Break-even**: Immediate (lower resource requirements)
- **Long-term**: Significant savings as scale increases

### Rollback Plan

If cache implementation causes issues:

1. **Feature flag to disable cache**
   ```typescript
   if (process.env.ENABLE_CACHE === 'false') {
     return fetchFromSource()
   }
   ```

2. **Gradual rollback**
   - Disable cache per service
   - Monitor impact
   - Fix issues before re-enabling

3. **Data preservation**
   - Keep existing caching mechanisms until new cache is proven
   - No data migration required (cache is ephemeral)

### Success Criteria

- [ ] 75% reduction in runner cold start time
- [ ] 90% reduction in gateway → control API calls
- [ ] Cache hit ratio > 85% for immutable data
- [ ] No increase in error rates
- [ ] Positive developer feedback

### Timeline

- **Week 1**: Infrastructure setup, cache client library
- **Week 2**: Runner and Gateway implementation
- **Week 3**: Control API implementation
- **Week 4**: Monitoring, optimization, documentation

Total estimated effort: **4 weeks** with 1-2 developers

### Local Development Quick Start

```bash
# 1. Start DragonflyDB locally (choose one):

# Option A: Using Docker (recommended)
docker run -d --name origan-cache -p 6379:6379 \
  docker.dragonflydb.io/dragonflydb/dragonfly \
  --maxmemory=512mb --logtostderr

# Option B: Using Docker Compose
cat > docker-compose.cache.yml << 'EOF'
services:
  cache:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    container_name: origan-cache
    ports:
      - "6379:6379"
    command: ["dragonfly", "--logtostderr", "--maxmemory=512mb"]
    networks:
      - origan-network
networks:
  origan-network:
    external: true
EOF
docker-compose -f docker-compose.cache.yml up -d

# Option C: Native installation (macOS)
brew install dragonflydb/tap/dragonfly
dragonfly --logtostderr --maxmemory=512mb

# 2. Test connection
redis-cli ping
# Should return: PONG

# 3. Add to your service .env files
echo "CACHE_URL=redis://localhost:6379" >> .env.local
echo "CACHE_ENABLED=true" >> .env.local

# 4. Stop cache when done
docker stop origan-cache  # If using Docker
# Or Ctrl+C if running natively
```

### Production Deployment with Pulumi

```bash
# 1. Add to your Pulumi project
cd infra
mkdir -p src/resources/cache

# 2. Create the DragonflyDB resource (copy the code from above)
# 3. Update main infrastructure file
# infra/src/index.ts
import { createDragonflyCache } from "./resources/cache/dragonfly";

const cache = createDragonflyCache("origan-cache", namespace, {
  memoryLimit: config.require("cache.memoryLimit") || "2Gi",
  cpuLimit: config.require("cache.cpuLimit") || "2",
  persistence: true,
});

// Export for other services
export const cacheEndpoint = cache.endpoint;

# 4. Deploy
pulumi up
```

### Monitoring DragonflyDB

```bash
# Connect to DragonflyDB CLI
redis-cli

# Check memory usage
INFO memory

# Check performance stats
INFO stats

# Monitor commands in real-time
MONITOR

# Check connected clients
CLIENT LIST

# Get all keys (careful in production)
KEYS *
```

### References

- [DragonflyDB Documentation](https://www.dragonflydb.io/docs)
- [DragonflyDB vs Redis Benchmark](https://www.dragonflydb.io/docs/getting-started/benchmarks)
- [Redis Compatibility](https://www.dragonflydb.io/docs/getting-started/redis-compatibility)
- [Cache-Aside Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
- [DragonflyDB GitHub](https://github.com/dragonflydb/dragonfly)