import { type Context, Resource } from "alchemy";
import { K3sApi } from "./api.js";

/**
 * Properties for creating a Kubernetes namespace
 */
export interface NamespaceProps {
  /**
   * Labels to apply to the namespace
   */
  labels?: Record<string, string>;
}

/**
 * Kubernetes namespace resource
 */
export interface Namespace extends Resource<"k3s::Namespace">, NamespaceProps {
  /**
   * Namespace name
   */
  name: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Kubernetes namespace resource
 *
 * @example
 * // Create a simple namespace
 * const ns = await Namespace("origan");
 *
 * @example
 * // Create a namespace with labels
 * const ns = await Namespace("production", {
 *   labels: {
 *     environment: "prod",
 *     team: "platform"
 *   }
 * });
 */
export const Namespace = Resource(
  "k3s::Namespace",
  async function (
    this: Context<Namespace>,
    name: string,
    props: NamespaceProps = {},
  ): Promise<Namespace> {
    const k3sApi = new K3sApi();

    if (this.phase === "delete") {
      try {
        await k3sApi.delete("namespace", name);
      } catch (error) {
        console.error("Error deleting namespace:", error);
      }
      return this.destroy();
    }

    // Create or update
    const namespaceManifest = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name,
        labels: props.labels,
      },
    };

    try {
      await k3sApi.apply(namespaceManifest);

      // Wait for namespace to be active
      console.log(`Waiting for namespace ${name} to be active...`);
      const maxRetries = 20; // 20 seconds timeout
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const ns = await k3sApi.get("namespace", name);
          if (ns.status?.phase === "Active") {
            console.log(`✅ Namespace ${name} is active`);
            break;
          }
        } catch (_error) {
          // Namespace might not exist yet
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        retries++;
      }

      if (retries === maxRetries) {
        throw new Error(`Timeout waiting for namespace ${name} to be active`);
      }
    } catch (error) {
      console.error("Error applying namespace manifest:", error);
      throw error;
    }

    return this({
      ...props,
      name,
      createdAt: Date.now(),
    });
  },
);
