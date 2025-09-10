import { type Context, Resource } from "alchemy";
import { K3sApi } from "../k3s/api.js";

/**
 * Properties for creating a NATS deployment
 */
export interface NatsDeploymentProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;

  /**
   * NATS version
   */
  version?: string;

  /**
   * Enable JetStream
   */
  jetstream?: boolean;

  /**
   * Enable persistent storage for JetStream (if false, uses memory only)
   */
  persistentStorage?: boolean;

  /**
   * Storage size for JetStream (e.g. "10Gi") - only used if persistentStorage is true
   */
  storageSize?: string;

  /**
   * Number of replicas (for clustering)
   */
  replicas?: number;

  /**
   * Resource limits
   */
  resources?: {
    memory?: string;
    cpu?: string;
  };
}

/**
 * NATS deployment resource output
 */
export interface NatsDeployment
  extends Resource<"nats::Deployment">,
    NatsDeploymentProps {
  /**
   * Service endpoint
   */
  endpoint: string;

  /**
   * Internal cluster endpoint
   */
  clusterEndpoint: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * NATS messaging system deployment on Kubernetes
 *
 * @example
 * // Create a simple NATS deployment
 * const nats = await NatsDeployment("nats", {
 *   namespace: "origan",
 *   jetstream: true,
 *   storageSize: "5Gi"
 * });
 *
 * @example
 * // Create a clustered NATS deployment
 * const nats = await NatsDeployment("nats-cluster", {
 *   namespace: "production",
 *   jetstream: true,
 *   storageSize: "20Gi",
 *   replicas: 3,
 *   resources: {
 *     memory: "1Gi",
 *     cpu: "500m"
 *   }
 * });
 */
export const NatsDeployment = Resource(
  "nats::Deployment",
  async function (
    this: Context<NatsDeployment>,
    name: string,
    props: NatsDeploymentProps = {},
  ): Promise<NatsDeployment> {
    const k3sApi = new K3sApi({ namespace: props.namespace || "default" });
    const namespace = props.namespace || "default";

    if (this.phase === "delete") {
      try {
        // Delete resources
        await k3sApi.delete("statefulset", name, namespace);
        await k3sApi.delete("service", name, namespace);
        await k3sApi.delete("service", `${name}-cluster`, namespace);
        await k3sApi.delete("configmap", `${name}-config`, namespace);
        // Delete PVCs
        for (let i = 0; i < (props.replicas || 1); i++) {
          await k3sApi.delete("pvc", `${name}-js-${name}-${i}`, namespace);
        }
      } catch (error) {
        console.error("Error deleting NATS resources:", error);
      }
      return this.destroy();
    }

    // Create or update
    const version = props.version || "2.10";
    const persistentStorage = props.persistentStorage === true; // Default to false (memory-only)
    const storageSize = props.storageSize || "1Gi";
    const replicas = props.replicas || 1;
    const jetstream = props.jetstream !== false; // Default to true

    // Create ConfigMap for NATS configuration
    const configMapManifest = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: `${name}-config`,
        namespace,
      },
      data: {
        "nats.conf": `
port: 4222
monitor_port: 8222

${
  jetstream
    ? `
jetstream {
  store_dir: /data/jetstream
  max_memory_store: 1GB
  max_file_store: 10GB
}
`
    : ""
}

${
  replicas > 1
    ? `
cluster {
  name: ${name}
  port: 6222
  
  routes: [
${Array.from(
  { length: replicas },
  (_, i) =>
    `    nats://${name}-${i}.${name}-cluster.${namespace}.svc.cluster.local:6222`,
).join("\n")}
  ]
  
  cluster_advertise: $CLUSTER_ADVERTISE
  connect_retries: 30
}
`
    : ""
}
        `.trim(),
      },
    };

    // Create StatefulSet
    const statefulSetManifest = {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: {
        name,
        namespace,
      },
      spec: {
        serviceName: `${name}-cluster`,
        replicas,
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
            containers: [
              {
                name: "nats",
                image: `nats:${version}-alpine`,
                ports: [
                  { containerPort: 4222, name: "client" },
                  { containerPort: 6222, name: "cluster" },
                  { containerPort: 8222, name: "monitor" },
                ],
                command: ["nats-server"],
                args: ["--config", "/etc/nats/nats.conf"],
                env:
                  replicas > 1
                    ? [
                        {
                          name: "CLUSTER_ADVERTISE",
                          value:
                            "$(POD_NAME).$(SERVICE_NAME).$(POD_NAMESPACE).svc.cluster.local",
                        },
                        {
                          name: "POD_NAME",
                          valueFrom: {
                            fieldRef: {
                              fieldPath: "metadata.name",
                            },
                          },
                        },
                        {
                          name: "POD_NAMESPACE",
                          valueFrom: {
                            fieldRef: {
                              fieldPath: "metadata.namespace",
                            },
                          },
                        },
                        {
                          name: "SERVICE_NAME",
                          value: `${name}-cluster`,
                        },
                      ]
                    : [],
                volumeMounts: [
                  {
                    name: "config",
                    mountPath: "/etc/nats",
                  },
                  ...(jetstream && persistentStorage
                    ? [
                        {
                          name: `${name}-js`,
                          mountPath: "/data/jetstream",
                        },
                      ]
                    : []),
                ],
                livenessProbe: {
                  httpGet: {
                    path: "/healthz",
                    port: 8222,
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: "/healthz",
                    port: 8222,
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                },
                ...(props.resources
                  ? {
                      resources: {
                        limits: {
                          memory: props.resources.memory,
                          cpu: props.resources.cpu,
                        },
                        requests: {
                          memory: props.resources.memory,
                          cpu: props.resources.cpu,
                        },
                      },
                    }
                  : {}),
              },
            ],
            volumes: [
              {
                name: "config",
                configMap: {
                  name: `${name}-config`,
                },
              },
            ],
          },
        },
        ...(jetstream && persistentStorage
          ? {
              volumeClaimTemplates: [
                {
                  metadata: {
                    name: `${name}-js`,
                  },
                  spec: {
                    accessModes: ["ReadWriteOnce"],
                    resources: {
                      requests: {
                        storage: storageSize,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
    };

    // Create Service for client connections
    const serviceManifest = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
        namespace,
      },
      spec: {
        selector: {
          app: name,
        },
        ports: [
          { port: 4222, targetPort: 4222, name: "client" },
          { port: 8222, targetPort: 8222, name: "monitor" },
        ],
        type: "ClusterIP",
      },
    };

    // Create headless Service for clustering
    const clusterServiceManifest = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: `${name}-cluster`,
        namespace,
      },
      spec: {
        selector: {
          app: name,
        },
        clusterIP: "None",
        ports: [
          { port: 4222, targetPort: 4222, name: "client" },
          { port: 6222, targetPort: 6222, name: "cluster" },
          { port: 8222, targetPort: 8222, name: "monitor" },
        ],
      },
    };

    // Apply manifests
    try {
      await k3sApi.apply(configMapManifest);
      await k3sApi.apply(serviceManifest);
      await k3sApi.apply(clusterServiceManifest);
      await k3sApi.apply(statefulSetManifest);
    } catch (error) {
      console.error("Error applying NATS manifests:", error);
      throw error;
    }

    // Wait for StatefulSet to be ready
    console.log(`Waiting for NATS StatefulSet ${name} to be ready...`);
    const maxRetries = 60; // 5 minutes timeout
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const statefulSet = await k3sApi.get("statefulset", name, namespace);
        const readyReplicas = statefulSet.status?.readyReplicas || 0;
        const desiredReplicas = statefulSet.spec?.replicas || replicas;

        if (readyReplicas === desiredReplicas) {
          console.log(
            `✅ NATS StatefulSet ${name} is ready (${readyReplicas}/${desiredReplicas} replicas)`,
          );
          break;
        }

        console.log(
          `⏳ Waiting... (${readyReplicas}/${desiredReplicas} replicas ready)`,
        );
      } catch (_error) {
        console.log("⏳ Waiting for StatefulSet to be created...");
      }

      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      retries++;
    }

    if (retries === maxRetries) {
      throw new Error(
        `Timeout waiting for NATS StatefulSet ${name} to be ready`,
      );
    }

    // Construct output
    const endpoint = `${name}.${namespace}.svc.cluster.local:4222`;
    const clusterEndpoint = `${name}-cluster.${namespace}.svc.cluster.local:4222`;

    return this({
      ...props,
      endpoint,
      clusterEndpoint,
      createdAt: Date.now(),
    });
  },
);
