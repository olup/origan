import alchemy, { type Context, Resource } from "alchemy";
import { K3sApi } from "./api.js";

/**
 * Container port configuration
 */
export interface ContainerPort {
  name?: string;
  containerPort: number;
  protocol?: "TCP" | "UDP";
}

/**
 * Environment variable configuration
 */
export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    secretKeyRef?: {
      name: string;
      key: string;
    };
    configMapKeyRef?: {
      name: string;
      key: string;
    };
  };
}

/**
 * Health check probe configuration
 */
export interface Probe {
  httpGet?: {
    path: string;
    port: number;
  };
  tcpSocket?: {
    port: number;
  };
  exec?: {
    command: string[];
  };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

/**
 * Resource requirements
 */
export interface ResourceRequirements {
  requests?: {
    memory?: string;
    cpu?: string;
  };
  limits?: {
    memory?: string;
    cpu?: string;
  };
}

/**
 * Properties for creating a Deployment
 */
export interface DeploymentProps {
  /**
   * Namespace to deploy to
   */
  namespace?: string;

  /**
   * Service account name
   */
  serviceAccountName?: string;

  /**
   * Container image
   */
  image: string;

  /**
   * Number of replicas
   */
  replicas?: number;

  /**
   * Container ports
   */
  ports?: ContainerPort[];

  /**
   * Environment variables
   */
  env?: EnvVar[];

  /**
   * Resource requirements
   */
  resources?: ResourceRequirements;

  /**
   * Readiness probe
   */
  readinessProbe?: Probe;

  /**
   * Liveness probe
   */
  livenessProbe?: Probe;

  /**
   * Image pull policy
   */
  imagePullPolicy?: "Always" | "IfNotPresent" | "Never";

  /**
   * Additional labels
   */
  labels?: Record<string, string>;
}

/**
 * Deployment resource
 */
export interface Deployment
  extends Resource<"k3s::Deployment">,
    DeploymentProps {
  /**
   * Deployment name
   */
  name: string;

  /**
   * Service endpoint
   */
  serviceEndpoint: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Kubernetes Deployment for running containerized applications
 *
 * @example
 * // Deploy API with environment variables
 * const api = await Deployment("control-api", {
 *   namespace: "origan",
 *   image: "registry.platform.origan.dev/control-api:latest",
 *   replicas: 2,
 *   ports: [{ name: "http", containerPort: 3000 }],
 *   env: [
 *     { name: "NODE_ENV", value: "production" },
 *     { name: "DATABASE_URL", valueFrom: { secretKeyRef: { name: "db-secret", key: "url" } } }
 *   ],
 *   resources: {
 *     requests: { memory: "256Mi", cpu: "100m" },
 *     limits: { memory: "512Mi", cpu: "500m" }
 *   },
 *   readinessProbe: {
 *     httpGet: { path: "/health", port: 3000 },
 *     initialDelaySeconds: 10
 *   }
 * });
 */
export const Deployment = Resource(
  "k3s::Deployment",
  async function (
    this: Context<Deployment>,
    name: string,
    props: DeploymentProps,
  ): Promise<Deployment> {
    const k3sApi = new K3sApi({ namespace: props.namespace || "default" });
    const namespace = props.namespace || "default";

    if (this.phase === "delete") {
      try {
        await k3sApi.delete("deployment", name, namespace);
        await k3sApi.delete("service", name, namespace);
      } catch (error) {
        console.error("Error deleting deployment:", error);
      }
      return this.destroy();
    }

    const labels = {
      app: name,
      ...props.labels,
    };

    // Create Deployment
    const deploymentManifest: any = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name,
        namespace,
        labels,
      },
      spec: {
        replicas: props.replicas || 1,
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
            ...(props.serviceAccountName && {
              serviceAccountName: props.serviceAccountName,
            }),
            containers: [
              {
                name,
                image: props.image,
                imagePullPolicy: props.imagePullPolicy || "IfNotPresent",
                ports: props.ports || [],
                env: props.env || [],
                resources: props.resources || {},
                readinessProbe: props.readinessProbe,
                livenessProbe: props.livenessProbe,
              },
            ],
          },
        },
      },
    };

    await k3sApi.apply(deploymentManifest);

    // Create Service if ports are defined
    if (props.ports && props.ports.length > 0) {
      const serviceManifest = {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name,
          namespace,
          labels,
        },
        spec: {
          selector: {
            app: name,
          },
          ports: props.ports.map((p) => ({
            name: p.name || `port-${p.containerPort}`,
            port: p.containerPort,
            targetPort: p.containerPort,
            protocol: p.protocol || "TCP",
          })),
        },
      };

      await k3sApi.apply(serviceManifest);
    }

    // Wait for deployment to be ready
    console.log(`Waiting for deployment ${name} to be ready...`);

    // Poll deployment status
    const maxAttempts = 60; // 5 minutes max wait
    let attempts = 0;
    let ready = false;

    while (attempts < maxAttempts && !ready) {
      try {
        const result = await k3sApi.exec(
          `kubectl get deployment ${name} -n ${namespace} -o jsonpath='{.status.conditions[?(@.type=="Available")].status}'`,
        );

        if (result.trim() === "True") {
          // Check if replicas are ready
          const replicaStatus = await k3sApi.exec(
            `kubectl get deployment ${name} -n ${namespace} -o jsonpath='{.status.readyReplicas}'`,
          );
          const desiredReplicas = props.replicas || 1;

          if (Number.parseInt(replicaStatus) >= desiredReplicas) {
            ready = true;
            console.log(
              `✅ Deployment ${name} is ready with ${replicaStatus}/${desiredReplicas} replicas`,
            );
          }
        }

        if (!ready) {
          // Check for pod errors
          const podStatus = await k3sApi.exec(
            `kubectl get pods -n ${namespace} -l app=${name} -o jsonpath='{.items[*].status.containerStatuses[*].state.waiting.reason}'`,
          );

          if (
            podStatus.includes("CrashLoopBackOff") ||
            podStatus.includes("ImagePullBackOff") ||
            podStatus.includes("ErrImagePull")
          ) {
            throw new Error(
              `Deployment failed: Pods are in error state: ${podStatus}`,
            );
          }

          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
        }
      } catch (error) {
        console.error(`Error checking deployment status: ${error}`);
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    if (!ready) {
      throw new Error(
        `Deployment ${name} failed to become ready within 5 minutes`,
      );
    }

    const serviceEndpoint = `${name}.${namespace}.svc.cluster.local`;

    return this({
      ...props,
      name,
      serviceEndpoint,
      createdAt: Date.now(),
    });
  },
);
