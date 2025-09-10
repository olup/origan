import { GarageBucket } from '../resources/garage/bucket.js';
import { GarageStaticSite } from '../resources/garage/static-site.js';
import { TraefikMiddleware } from '../resources/k3s/middleware.js';
import { Ingress } from '../resources/k3s/ingress.js';

export interface LandingPageDeploymentResult {
  bucket: GarageBucket;
  deployment: GarageStaticSite;
  middleware: TraefikMiddleware;
  ingress: Ingress;
}

/**
 * Deploy the Origan Landing Page as a static website
 */
export async function deployLandingPage(): Promise<LandingPageDeploymentResult> {
  // Create Garage bucket for Landing Page
  const landingBucket = await GarageBucket('origan-landing', {
    endpoint: process.env.GARAGE_ENDPOINT || 'https://s3.platform.origan.dev',
    keyName: 'origan-landing',
    website: true,
    indexDocument: 'index.html',
    errorDocument: '404.html'
  });
  
  // Deploy Landing Page files
  const landingDeployment = await GarageStaticSite('landing-deployment', {
    sourceDir: '../packages/landing/out',
    bucketName: landingBucket.name,
    endpoint: landingBucket.endpoint,
    accessKeyId: landingBucket.accessKeyId,
    secretAccessKey: landingBucket.secretAccessKey,
    cleanupOrphaned: true
  });
  
  // Create middleware for Host header rewrite in platform namespace
  const landingMiddleware = await TraefikMiddleware('origan-landing-headers', {
    namespace: 'platform',
    type: 'headers',
    config: {
      customRequestHeaders: {
        'Host': 'origan-landing'
      }
    }
  });
  
  // Create Ingress in platform namespace
  const landingIngress = await Ingress('origan-landing-ingress', {
    namespace: 'platform',
    hostname: 'hello.origan.dev',
    backend: {
      service: 'garage',
      port: 3902
    },
    tls: true,
    annotations: {
      'traefik.ingress.kubernetes.io/router.middlewares': landingMiddleware.reference
    }
  });
  
  return {
    bucket: landingBucket,
    deployment: landingDeployment,
    middleware: landingMiddleware,
    ingress: landingIngress
  };
}