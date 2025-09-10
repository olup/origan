import alchemy, { Resource, type Context } from 'alchemy';
import { K3sApi } from './api.js';

/**
 * Properties for creating a Traefik Middleware
 */
export interface TraefikMiddlewareProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;
  
  /**
   * Type of middleware
   */
  type: 'stripPrefix' | 'addPrefix' | 'replacePath' | 'replacePathRegex' | 'headers';
  
  /**
   * Configuration based on type
   */
  config: {
    /**
     * For stripPrefix: prefixes to remove
     */
    prefixes?: string[];
    
    /**
     * For addPrefix: prefix to add
     */
    prefix?: string;
    
    /**
     * For replacePath: new path
     */
    path?: string;
    
    /**
     * For replacePathRegex: regex and replacement
     */
    regex?: string;
    replacement?: string;
    
    /**
     * For headers: custom headers
     */
    customRequestHeaders?: Record<string, string>;
    customResponseHeaders?: Record<string, string>;
  };
}

/**
 * Traefik Middleware resource
 */
export interface TraefikMiddleware extends Resource<"k3s::TraefikMiddleware">, TraefikMiddlewareProps {
  /**
   * Middleware name
   */
  name: string;
  
  /**
   * Full middleware reference for ingress
   */
  reference: string;
  
  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Traefik Middleware for request/response transformation
 * 
 * @example
 * // Create middleware to add bucket prefix
 * const bucketMiddleware = await TraefikMiddleware("admin-bucket", {
 *   namespace: "origan",
 *   type: "addPrefix",
 *   config: {
 *     prefix: "/origan-admin-panel"
 *   }
 * });
 * 
 * @example
 * // Create middleware for headers
 * const headersMiddleware = await TraefikMiddleware("cors-headers", {
 *   namespace: "origan",
 *   type: "headers",
 *   config: {
 *     customResponseHeaders: {
 *       "Access-Control-Allow-Origin": "*",
 *       "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
 *     }
 *   }
 * });
 */
export const TraefikMiddleware = Resource(
  "k3s::TraefikMiddleware",
  async function(this: Context<TraefikMiddleware>, name: string, props: TraefikMiddlewareProps): Promise<TraefikMiddleware> {
    const k3sApi = new K3sApi({ namespace: props.namespace || 'default' });
    const namespace = props.namespace || 'default';
    
    if (this.phase === "delete") {
      try {
        await k3sApi.delete('middleware.traefik.io', name, namespace);
      } catch (error) {
        console.error('Error deleting middleware:', error);
      }
      return this.destroy();
    }
    
    // Build middleware spec based on type
    let spec: any = {};
    
    switch (props.type) {
      case 'stripPrefix':
        spec.stripPrefix = {
          prefixes: props.config.prefixes || []
        };
        break;
      
      case 'addPrefix':
        spec.addPrefix = {
          prefix: props.config.prefix || ''
        };
        break;
      
      case 'replacePath':
        spec.replacePath = {
          path: props.config.path || '/'
        };
        break;
      
      case 'replacePathRegex':
        spec.replacePathRegex = {
          regex: props.config.regex || '',
          replacement: props.config.replacement || ''
        };
        break;
      
      case 'headers':
        spec.headers = {
          customRequestHeaders: props.config.customRequestHeaders || {},
          customResponseHeaders: props.config.customResponseHeaders || {}
        };
        break;
    }
    
    // Create Middleware CRD
    const middlewareManifest = {
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'Middleware',
      metadata: {
        name,
        namespace
      },
      spec
    };
    
    // Apply manifest
    try {
      await k3sApi.apply(middlewareManifest);
    } catch (error) {
      console.error('Error applying middleware manifest:', error);
      throw error;
    }
    
    console.log(`✅ Middleware ${name} created`);
    
    const reference = `${namespace}-${name}@kubernetescrd`;
    
    return this({
      ...props,
      name,
      reference,
      createdAt: Date.now()
    });
  }
);