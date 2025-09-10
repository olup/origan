import alchemy, { Resource, type Context } from 'alchemy';
import { K3sApi } from './api.js';

/**
 * Properties for creating a Kubernetes Ingress
 */
export interface IngressProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;
  
  /**
   * Hostname for the ingress
   */
  hostname: string;
  
  /**
   * Backend service configuration
   */
  backend: {
    /**
     * Service name or external URL
     */
    service: string;
    
    /**
     * Service port
     */
    port: number;
    
    /**
     * Is this an external service (not in cluster)?
     */
    external?: boolean;
  };
  
  /**
   * Enable TLS with Let's Encrypt
   */
  tls?: boolean;
  
  /**
   * Ingress class (default: traefik)
   */
  ingressClass?: string;
  
  /**
   * Additional annotations
   */
  annotations?: Record<string, string>;
  
  /**
   * Path prefix (default: /)
   */
  pathPrefix?: string;
}

/**
 * Kubernetes Ingress resource
 */
export interface Ingress extends Resource<"k3s::Ingress">, IngressProps {
  /**
   * Ingress name
   */
  name: string;
  
  /**
   * Full URL
   */
  url: string;
  
  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Kubernetes Ingress for routing external traffic
 * 
 * @example
 * // Create ingress for a service
 * const ingress = await Ingress("api-ingress", {
 *   namespace: "origan",
 *   hostname: "api.origan.dev",
 *   backend: {
 *     service: "gateway",
 *     port: 3000
 *   },
 *   tls: true
 * });
 * 
 * @example
 * // Create ingress for Garage website
 * const websiteIngress = await Ingress("admin-ingress", {
 *   namespace: "origan",
 *   hostname: "app.origan.dev",
 *   backend: {
 *     service: "s3.platform.origan.dev",
 *     port: 443,
 *     external: true
 *   },
 *   tls: true,
 *   annotations: {
 *     "traefik.ingress.kubernetes.io/router.middlewares": "origan-rewrite-admin@kubernetescrd"
 *   }
 * });
 */
export const Ingress = Resource(
  "k3s::Ingress",
  async function(this: Context<Ingress>, name: string, props: IngressProps): Promise<Ingress> {
    const k3sApi = new K3sApi({ namespace: props.namespace || 'default' });
    const namespace = props.namespace || 'default';
    
    if (this.phase === "delete") {
      try {
        await k3sApi.delete('ingress', name, namespace);
        if (props.backend.external) {
          // Delete the external service if it exists
          await k3sApi.delete('service', `${name}-external`, namespace);
          await k3sApi.delete('endpoints', `${name}-external`, namespace);
        }
      } catch (error) {
        console.error('Error deleting ingress:', error);
      }
      return this.destroy();
    }
    
    // Create or update
    const ingressClass = props.ingressClass || 'traefik';
    const pathPrefix = props.pathPrefix || '/';
    
    // Default annotations
    const annotations: Record<string, string> = {
      'kubernetes.io/ingress.class': ingressClass,
      ...props.annotations
    };
    
    // Add cert-manager annotation for TLS
    if (props.tls) {
      annotations['cert-manager.io/cluster-issuer'] = 'letsencrypt-prod';
    }
    
    // For external services (like Garage), we need to create a Service and Endpoints
    if (props.backend.external) {
      // Parse the external URL to get host and port
      const url = new URL(`https://${props.backend.service}`);
      const externalHost = url.hostname;
      const externalPort = props.backend.port;
      
      // Create ExternalName service or Endpoints-based service
      const serviceManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: `${name}-external`,
          namespace
        },
        spec: {
          type: 'ClusterIP',
          ports: [{
            port: externalPort,
            targetPort: externalPort,
            protocol: 'TCP'
          }]
        }
      };
      
      // Create Endpoints for the external service
      const endpointsManifest = {
        apiVersion: 'v1',
        kind: 'Endpoints',
        metadata: {
          name: `${name}-external`,
          namespace
        },
        subsets: [{
          addresses: [{
            ip: await resolveHostname(externalHost)
          }],
          ports: [{
            port: externalPort,
            protocol: 'TCP'
          }]
        }]
      };
      
      await k3sApi.apply(serviceManifest);
      await k3sApi.apply(endpointsManifest);
    }
    
    // Create Ingress
    const ingressManifest = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name,
        namespace,
        annotations
      },
      spec: {
        ...(props.tls ? {
          tls: [{
            hosts: [props.hostname],
            secretName: `${name}-tls`
          }]
        } : {}),
        rules: [{
          host: props.hostname,
          http: {
            paths: [{
              path: pathPrefix,
              pathType: 'Prefix',
              backend: {
                service: {
                  name: props.backend.external ? `${name}-external` : props.backend.service,
                  port: {
                    number: props.backend.port
                  }
                }
              }
            }]
          }
        }]
      }
    };
    
    // Apply manifest
    try {
      await k3sApi.apply(ingressManifest);
    } catch (error) {
      console.error('Error applying ingress manifest:', error);
      throw error;
    }
    
    // Wait for ingress to be ready
    console.log(`Waiting for ingress ${name} to be ready...`);
    const maxRetries = 30; // 30 seconds timeout
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        const ingress = await k3sApi.get('ingress', name, namespace);
        if (ingress.status?.loadBalancer?.ingress?.length > 0) {
          console.log(`✅ Ingress ${name} is ready`);
          break;
        }
      } catch (error) {
        // Ingress might not exist yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      retries++;
    }
    
    const protocol = props.tls ? 'https' : 'http';
    const url = `${protocol}://${props.hostname}`;
    
    return this({
      ...props,
      name,
      url,
      createdAt: Date.now()
    });
  }
);

/**
 * Resolve hostname to IP address
 */
async function resolveHostname(hostname: string): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  // If it's already an IP, return it
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }
  
  try {
    const { stdout } = await execAsync(`nslookup ${hostname} | grep -A1 "Name:" | grep "Address:" | awk '{print $2}'`);
    return stdout.trim() || '127.0.0.1';
  } catch {
    // Fallback to the node IP for platform services
    return '62.171.156.174';
  }
}