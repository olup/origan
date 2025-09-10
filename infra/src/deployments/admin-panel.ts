import { GarageBucket } from '../resources/garage/bucket.js';
import { GarageStaticSite } from '../resources/garage/static-site.js';
import { TraefikMiddleware } from '../resources/k3s/middleware.js';
import { Ingress } from '../resources/k3s/ingress.js';

export interface AdminPanelDeploymentResult {
  bucket: GarageBucket;
  deployment: GarageStaticSite;
  middleware: TraefikMiddleware;
  ingress: Ingress;
}

/**
 * Deploy the Origan Admin Panel as a static website
 */
export async function deployAdminPanel(): Promise<AdminPanelDeploymentResult> {
  // Create Garage bucket for Admin Panel
  const adminPanelBucket = await GarageBucket('origan-admin-panel', {
    endpoint: process.env.GARAGE_ENDPOINT || 'https://s3.platform.origan.dev',
    keyName: 'origan-admin',
    website: true,
    indexDocument: 'index.html',
    errorDocument: 'index.html'  // For SPA routing
  });
  
  // Deploy Admin Panel files
  const adminPanelDeployment = await GarageStaticSite('admin-panel-deployment', {
    sourceDir: '../packages/admin-panel/dist',
    bucketName: adminPanelBucket.name,
    endpoint: adminPanelBucket.endpoint,
    accessKeyId: adminPanelBucket.accessKeyId,
    secretAccessKey: adminPanelBucket.secretAccessKey,
    cleanupOrphaned: true
  });
  
  // Create middleware for Host header rewrite in platform namespace (same as Garage)
  const adminMiddleware = await TraefikMiddleware('origan-admin-headers', {
    namespace: 'platform',
    type: 'headers',
    config: {
      customRequestHeaders: {
        'Host': 'origan-admin-panel'
      }
    }
  });
  
  // Create Ingress in platform namespace (same as Garage service)
  const adminIngress = await Ingress('origan-admin-ingress', {
    namespace: 'platform',
    hostname: 'app.origan.dev',
    backend: {
      service: 'garage',  // Direct reference to garage service in same namespace
      port: 3902
    },
    tls: true,
    annotations: {
      // Use Traefik middleware to rewrite Host header
      'traefik.ingress.kubernetes.io/router.middlewares': adminMiddleware.reference
    }
  });
  
  return {
    bucket: adminPanelBucket,
    deployment: adminPanelDeployment,
    middleware: adminMiddleware,
    ingress: adminIngress
  };
}