import { type Context, Resource } from "alchemy";
import { K3sApi } from "./api.js";

/**
 * Properties for creating an ExternalName Service
 */
export interface ExternalServiceProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;

  /**
   * External hostname to reference
   */
  externalName: string;

  /**
   * Port mappings
   */
  ports?: Array<{
    name?: string;
    port: number;
    targetPort?: number;
  }>;
}

/**
 * ExternalName Service resource
 */
export interface ExternalService
  extends Resource<"k3s::ExternalService">,
    ExternalServiceProps {
  /**
   * Service name
   */
  name: string;

  /**
   * Full service DNS name
   */
  serviceName: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * ExternalName Service for referencing services in other namespaces or external services
 *
 * @example
 * // Reference a service in another namespace
 * const garageWeb = await ExternalService("garage-web", {
 *   namespace: "origan",
 *   externalName: "garage.platform.svc.cluster.local",
 *   ports: [{
 *     name: "web",
 *     port: 3902
 *   }]
 * });
 */
export const ExternalService = Resource(
  "k3s::ExternalService",
  async function (
    this: Context<ExternalService>,
    name: string,
    props: ExternalServiceProps,
  ): Promise<ExternalService> {
    const k3sApi = new K3sApi({ namespace: props.namespace || "default" });
    const namespace = props.namespace || "default";

    if (this.phase === "delete") {
      try {
        await k3sApi.delete("service", name, namespace);
      } catch (error) {
        console.error("Error deleting external service:", error);
      }
      return this.destroy();
    }

    // Create ExternalName Service
    const serviceManifest: any = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
        namespace,
      },
      spec: {
        type: "ExternalName",
        externalName: props.externalName,
      },
    };

    // Add ports if specified
    if (props.ports && props.ports.length > 0) {
      serviceManifest.spec.ports = props.ports.map((p) => ({
        name: p.name || `port-${p.port}`,
        port: p.port,
        targetPort: p.targetPort || p.port,
        protocol: "TCP",
      }));
    }

    // Apply manifest
    try {
      await k3sApi.apply(serviceManifest);
    } catch (error) {
      console.error("Error applying external service manifest:", error);
      throw error;
    }

    console.log(`✅ ExternalName service ${name} created`);

    const serviceName = `${name}.${namespace}.svc.cluster.local`;

    return this({
      ...props,
      name,
      serviceName,
      createdAt: Date.now(),
    });
  },
);
