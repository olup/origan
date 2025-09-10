import { type Context, Resource } from "alchemy";
import { K3sApi } from "../k3s/api.js";

/**
 * Properties for creating a PostgreSQL database
 */
export interface PostgresDatabaseProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;

  /**
   * PostgreSQL version
   */
  version?: string;

  /**
   * Storage size (e.g. "10Gi")
   */
  storageSize?: string;

  /**
   * Database name
   */
  database: string;

  /**
   * Database user
   */
  user: string;

  /**
   * Database password (will be stored as a secret)
   */
  password: string;

  /**
   * Number of replicas (for HA setup)
   */
  replicas?: number;
}

/**
 * PostgreSQL database resource output
 */
export interface PostgresDatabase
  extends Resource<"postgres::Database">,
    PostgresDatabaseProps {
  /**
   * Service endpoint
   */
  endpoint: string;

  /**
   * Connection string
   */
  connectionString: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * PostgreSQL database on Kubernetes
 *
 * @example
 * // Create a simple PostgreSQL database
 * const db = await PostgresDatabase("myapp-db", {
 *   database: "myapp",
 *   user: "myapp_user",
 *   password: alchemy.secret("super-secret-password"),
 *   storageSize: "10Gi"
 * });
 *
 * @example
 * // Create a PostgreSQL database in a specific namespace
 * const db = await PostgresDatabase("origan-db", {
 *   namespace: "origan",
 *   database: "origan",
 *   user: "origan_root",
 *   password: alchemy.secret(process.env.DB_PASSWORD),
 *   storageSize: "20Gi",
 *   version: "16"
 * });
 */
export const PostgresDatabase = Resource(
  "postgres::Database",
  async function (
    this: Context<PostgresDatabase>,
    name: string,
    props: PostgresDatabaseProps,
  ): Promise<PostgresDatabase> {
    const k3sApi = new K3sApi({ namespace: props.namespace || "default" });
    const namespace = props.namespace || "default";

    if (this.phase === "delete") {
      try {
        // Delete resources
        await k3sApi.delete("statefulset", name, namespace);
        await k3sApi.delete("service", name, namespace);
        await k3sApi.delete("secret", `${name}-secret`, namespace);
        await k3sApi.delete("pvc", `postgres-storage-${name}-0`, namespace);
      } catch (error) {
        console.error("Error deleting PostgreSQL resources:", error);
      }
      return this.destroy();
    }

    // Create or update
    const version = props.version || "16";
    const storageSize = props.storageSize || "10Gi";
    const replicas = props.replicas || 1;

    // Create Secret
    const secretManifest = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: `${name}-secret`,
        namespace,
      },
      type: "Opaque",
      stringData: {
        POSTGRES_DB: props.database,
        POSTGRES_USER: props.user,
        POSTGRES_PASSWORD: props.password,
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
        serviceName: name,
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
                name: "postgres",
                image: `postgres:${version}`,
                ports: [
                  {
                    containerPort: 5432,
                    name: "postgres",
                  },
                ],
                envFrom: [
                  {
                    secretRef: {
                      name: `${name}-secret`,
                    },
                  },
                ],
                volumeMounts: [
                  {
                    name: "postgres-storage",
                    mountPath: "/var/lib/postgresql/data",
                  },
                ],
                livenessProbe: {
                  exec: {
                    command: [
                      "pg_isready",
                      "-U",
                      props.user,
                      "-d",
                      props.database,
                    ],
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  exec: {
                    command: [
                      "pg_isready",
                      "-U",
                      props.user,
                      "-d",
                      props.database,
                    ],
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                },
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: "postgres-storage",
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
      },
    };

    // Create Service
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
          {
            port: 5432,
            targetPort: 5432,
            name: "postgres",
          },
        ],
        type: "ClusterIP",
      },
    };

    // Apply manifests
    try {
      await k3sApi.apply(secretManifest);
      await k3sApi.apply(serviceManifest);
      await k3sApi.apply(statefulSetManifest);
    } catch (error) {
      console.error("Error applying PostgreSQL manifests:", error);
      throw error;
    }

    // Wait for StatefulSet to be ready
    console.log(`Waiting for PostgreSQL StatefulSet ${name} to be ready...`);
    const maxRetries = 60; // 5 minutes timeout
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const statefulSet = await k3sApi.get("statefulset", name, namespace);
        const readyReplicas = statefulSet.status?.readyReplicas || 0;
        const desiredReplicas = statefulSet.spec?.replicas || replicas;

        if (readyReplicas === desiredReplicas) {
          console.log(
            `✅ PostgreSQL StatefulSet ${name} is ready (${readyReplicas}/${desiredReplicas} replicas)`,
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
        `Timeout waiting for PostgreSQL StatefulSet ${name} to be ready`,
      );
    }

    // Construct output
    const endpoint = `${name}.${namespace}.svc.cluster.local:5432`;
    const connectionString = `postgresql://${props.user}:${props.password}@${endpoint}/${props.database}`;

    return this({
      ...props,
      endpoint,
      connectionString,
      createdAt: Date.now(),
    });
  },
);
