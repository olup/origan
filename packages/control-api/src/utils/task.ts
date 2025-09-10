import * as k8s from "@kubernetes/client-node";
import Dockerode from "dockerode";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";

export type TaskStatus = "started" | "completed" | "failed";

export type TaskEvent = {
  status: TaskStatus;
  taskId: string;
  timestamp: string;
  error?: string;
  exitCode?: number;
  message?: string;
};

export type TaskDetails = {
  id: string;
  containerId?: string;
  jobName?: string;
  startedAt: string;
};

export type BuildLogEntry = {
  timestamp: string;
  level: "info" | "error" | "warn" | "debug";
  message: string;
};

export interface ResourceLimits {
  cpu?: string;
  memory?: string;
  cpuRequests?: string;
  memoryRequests?: string;
  timeoutSeconds?: number;
}

export interface TaskParams {
  taskId: string;
  imageName: string;
  env?: Record<string, string>;
  namePrefix?: string;
  resources?: ResourceLimits;
}

export interface TaskRunner {
  startTask: (params: TaskParams) => Promise<TaskDetails>;
}

export class DockerTaskRunner implements TaskRunner {
  async startTask(params: TaskParams): Promise<TaskDetails> {
    const log = getLogger();

    const {
      taskId,
      imageName,
      env = {},
      namePrefix = "origan-task",
      resources,
    } = params;

    const containerId = `${namePrefix}-${taskId}`;

    log.info(`[Docker Task - ${taskId}] Starting task with image ${imageName}`);

    const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      log.info(
        `[Docker Task - ${taskId}] Creating container ${containerId} with image ${imageName}`,
      );

      // Parse and convert resource constraints to Docker format
      const hostConfig: Dockerode.HostConfig = {
        // AutoRemove: true,
        NetworkMode: "origan_origan-network",
      };

      if (resources) {
        // Convert memory from Kubernetes format (e.g., 256Mi, 1Gi) to bytes for Docker
        if (resources.memory) {
          const memoryBytes = convertK8sResourceToBytes(resources.memory);
          if (memoryBytes > 0) {
            hostConfig.Memory = memoryBytes;
          }
        }

        // Convert memory requests
        if (resources.memoryRequests) {
          const memoryReservation = convertK8sResourceToBytes(
            resources.memoryRequests,
          );
          if (memoryReservation > 0) {
            hostConfig.MemoryReservation = memoryReservation;
          }
        }

        // Convert CPU limits from Kubernetes format to Docker NanoCPUs format
        if (resources.cpu) {
          const nanoCpus = convertK8sCpuToNanoCpu(resources.cpu);
          if (nanoCpus > 0) {
            hostConfig.NanoCpus = nanoCpus;
          }
        }
      }

      // Convert env object to array format required by Docker
      const envArray = Object.entries(env).map(
        ([key, value]) => `${key}=${value}`,
      );

      const container = await docker.createContainer({
        Image: imageName,
        name: containerId,
        Env: envArray,
        HostConfig: hostConfig,
        Labels: {
          "origan.com/task-id": taskId,
          "origan.com/created-at": new Date().toISOString(),
          "app.kubernetes.io/name": namePrefix,
          "app.kubernetes.io/component": "task-container",
        },
      });

      await container.start();

      log.info(
        `[Docker Task - ${taskId}] Container ${containerId} (ID: ${container.id}) started.`,
      );

      // Set timeout if specified
      if (resources?.timeoutSeconds && resources.timeoutSeconds > 0) {
        timeoutHandle = setTimeout(async () => {
          try {
            log.info(
              `[Docker Task - ${taskId}] Task exceeded timeout of ${resources.timeoutSeconds}s, stopping container.`,
            );
            await container.stop();
          } catch (error) {
            log
              .withError(error)
              .error(
                `[Docker Task - ${taskId}] Failed to stop container that exceeded timeout:`,
              );
          }
        }, resources.timeoutSeconds * 1000);
      }

      const startDetails: TaskDetails = {
        id: taskId,
        containerId: container.id,
        startedAt: new Date().toISOString(),
      };

      // Start monitoring container status in background
      container.wait().then(async (data: { StatusCode: number }) => {
        // Clear timeout if it was set
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        log.info(
          `[Docker Task - ${taskId}] Container ${containerId} exited with status code ${data.StatusCode}.`,
        );

        // try {
        //   await container.remove({ force: true });
        // } catch (_error) {
        //   log.info(
        //     `[Docker Task - ${taskId}] Container already removed or not found`
        //   );
        // }
      });

      return startDetails;
    } catch (error) {
      throw new Error(`Failed to create Docker container ${containerId}`, {
        cause: error,
      });
    }
  }
}

export class KubernetesTaskRunner implements TaskRunner {
  async startTask(params: TaskParams): Promise<TaskDetails> {
    const log = getLogger();
    const { taskId, imageName, env = {}, namePrefix = "task-runner" } = params;

    log.info(`[K8s Task - ${taskId}] Starting task with image ${imageName}`);

    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sBatchV1Api = kc.makeApiClient(k8s.BatchV1Api);

    // TODO: Currently using default namespace and service account - we could consider moving to a different namespace
    const namespace = "default";
    const jobName = `${namePrefix}-${taskId.substring(0, 8)}-${Date.now()}`;

    const jobManifest: k8s.V1Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: namespace,
        labels: {
          "origan.com/task-id": taskId,
          "app.kubernetes.io/name": namePrefix,
          "app.kubernetes.io/component": "task-job",
        },
      },
      spec: {
        template: {
          metadata: {
            labels: {
              "origan.com/task-id": taskId,
              "app.kubernetes.io/name": namePrefix,
            },
          },
          spec: {
            serviceAccountName: "builder-sa",
            containers: [
              {
                name: `${namePrefix}-container`,
                image: imageName,
                env: Object.entries(env).map(([name, value]) => ({
                  name,
                  value,
                })),
                resources: {
                  requests: {
                    cpu: params.resources?.cpuRequests || "250m",
                    memory: params.resources?.memoryRequests || "256Mi",
                  },
                  limits: {
                    cpu: params.resources?.cpu || "1",
                    memory: params.resources?.memory || "1Gi",
                  },
                },
              },
            ],
            restartPolicy: "Never",
          },
        },
        backoffLimit: 1,
        ttlSecondsAfterFinished: params.resources?.timeoutSeconds
          ? Math.max(60, params.resources.timeoutSeconds + 60)
          : 3600,
      },
    };

    try {
      log.info(
        `[K8s Task - ${taskId}] Attempting to create Job: ${jobName} in namespace ${namespace}`,
      );

      await k8sBatchV1Api.createNamespacedJob({
        namespace: namespace,
        body: jobManifest,
      });

      log.info(`[K8s Task - ${taskId}] Job ${jobName} created successfully.`);

      return {
        id: taskId,
        jobName,
        startedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to create Kubernetes Job ${jobName}`, {
        cause: error,
      });
    }
  }
}

// Helper functions to convert between K8s and Docker resource formats
function convertK8sResourceToBytes(k8sResource: string): number {
  const match = k8sResource.match(/^(\d+)(Ki|Mi|Gi|Ti|Pi|k|m|g|t|p)?$/i);
  if (!match) return 0;

  const value = Number.parseInt(match[1], 10);
  const unit = (match[2] || "").toLowerCase();

  const multipliers: Record<string, number> = {
    ki: 1024,
    mi: 1024 * 1024,
    gi: 1024 * 1024 * 1024,
    ti: 1024 * 1024 * 1024 * 1024,
    pi: 1024 * 1024 * 1024 * 1024 * 1024,
    k: 1000,
    m: 1000 * 1000,
    g: 1000 * 1000 * 1000,
    t: 1000 * 1000 * 1000 * 1000,
    p: 1000 * 1000 * 1000 * 1000 * 1000,
    "": 1,
  };

  return value * (multipliers[unit] || 1);
}

function convertK8sCpuToNanoCpu(k8sCpu: string): number {
  if (k8sCpu.endsWith("m")) {
    // Convert millicores to nanocpus (1m = 1000000 nanocpus)
    return Number.parseInt(k8sCpu.replace("m", ""), 10) * 1000000;
  }
  // Convert cores to nanocpus (1 core = 1000000000 nanocpus)
  return Number.parseFloat(k8sCpu) * 1000000000;
}

export interface TaskOptions {
  taskId: string;
  imageName: string;
  env?: Record<string, string>;
  namePrefix?: string;
  resources?: ResourceLimits;
  environment?: string;
}

export async function triggerTask(options: TaskOptions): Promise<TaskDetails> {
  const environment = options.environment || env.APP_ENV;

  const taskRunner: TaskRunner =
    environment === "production"
      ? new KubernetesTaskRunner()
      : new DockerTaskRunner();

  return taskRunner.startTask({
    taskId: options.taskId,
    imageName: options.imageName,
    env: options.env,
    namePrefix: options.namePrefix,
    resources: options.resources,
  });
}
