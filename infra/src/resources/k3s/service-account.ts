import { type Context, Resource } from "alchemy";
import { K3sApi } from "./api.js";

/**
 * Properties for creating a Kubernetes ServiceAccount
 */
export interface ServiceAccountProps {
  /**
   * Namespace for the ServiceAccount
   */
  namespace: string;

  /**
   * Labels to apply to the ServiceAccount
   */
  labels?: Record<string, string>;
}

/**
 * Kubernetes ServiceAccount resource
 */
export interface ServiceAccount
  extends Resource<"k3s::ServiceAccount">,
    ServiceAccountProps {
  /**
   * ServiceAccount name
   */
  name: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Create a Kubernetes ServiceAccount
 *
 * @example
 * const sa = await K3sServiceAccount("my-sa", {
 *   namespace: "default",
 *   labels: {
 *     app: "my-app"
 *   }
 * });
 */
export const K3sServiceAccount = Resource(
  "k3s::ServiceAccount",
  async function (
    this: Context<ServiceAccount>,
    name: string,
    props: ServiceAccountProps,
  ): Promise<ServiceAccount> {
    const api = new K3sApi({ namespace: props.namespace });
    const namespace = props.namespace;

    if (this.phase === "delete") {
      try {
        await api.delete("serviceaccount", name, namespace);
      } catch (error) {
        console.error("Error deleting ServiceAccount:", error);
      }
      return this.destroy();
    }

    // Check if ServiceAccount already exists
    try {
      const _existing = await api.kubectl(
        `get serviceaccount ${name} -n ${namespace}`,
      );
      console.log(
        `ServiceAccount ${name} already exists in namespace ${namespace}`,
      );
      return this({
        name,
        namespace,
        labels: props.labels,
        createdAt: Date.now(),
      });
    } catch (_error: any) {
      // ServiceAccount doesn't exist, create it
    }

    // Create ServiceAccount
    const manifest = {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: {
        name,
        namespace,
        labels: props.labels,
      },
    };

    await api.apply(manifest);
    console.log(`✅ ServiceAccount ${name} created in namespace ${namespace}`);

    return this({
      name,
      namespace,
      labels: props.labels,
      createdAt: Date.now(),
    });
  },
);
