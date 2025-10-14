import { spawn } from "node:child_process";
import * as k8s from "@kubernetes/client-node";
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

export class LocalProcessTaskRunner implements TaskRunner {
  async startTask(params: TaskParams): Promise<TaskDetails> {
    const log = getLogger();

    const { taskId, env: envVars = {}, resources } = params;

    log.info(`[Local Process - ${taskId}] Starting builder task with tsx`);

    const builderPath = "../builder";
    const tsxCommand = "pnpm";
    const tsxArgs = ["--filter", "@origan/builder", "dev"];

    // Create a temporary work directory for this build
    const tmpDir = `/tmp/origan-builds/${taskId}`;

    const childProcess = spawn(tsxCommand, tsxArgs, {
      cwd: builderPath,
      env: {
        ...process.env,
        ...envVars,
        WORK_DIR: tmpDir,
      },
      stdio: ["ignore", "inherit", "inherit"],
      detached: false,
    });

    log.info(
      `[Local Process - ${taskId}] Process started with PID ${childProcess.pid}`,
    );

    // Set timeout if specified
    if (resources?.timeoutSeconds && resources.timeoutSeconds > 0) {
      setTimeout(() => {
        if (!childProcess.killed) {
          log.info(
            `[Local Process - ${taskId}] Task exceeded timeout of ${resources.timeoutSeconds}s, killing process.`,
          );
          childProcess.kill("SIGTERM");
        }
      }, resources.timeoutSeconds * 1000);
    }

    // Handle process exit
    childProcess.on("exit", (code, signal) => {
      if (code !== null) {
        log.info(
          `[Local Process - ${taskId}] Process exited with code ${code}`,
        );
      } else if (signal) {
        log.info(
          `[Local Process - ${taskId}] Process killed by signal ${signal}`,
        );
      }
    });

    childProcess.on("error", (error) => {
      log.withError(error).error(`[Local Process - ${taskId}] Process error`);
    });

    return {
      id: taskId,
      containerId: String(childProcess.pid),
      startedAt: new Date().toISOString(),
    };
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

    // Use origan namespace where all our resources are deployed
    const namespace = env.K8S_NAMESPACE || process.env.K8S_NAMESPACE;
    if (!namespace) {
      throw new Error(
        "K8S_NAMESPACE environment variable is required when APP_ENV=production",
      );
    }
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
            // No serviceAccount needed - builder doesn't interact with K8s API
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
        backoffLimit: 0, // No retries - fail immediately for easier debugging
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
      : new LocalProcessTaskRunner();

  return taskRunner.startTask({
    taskId: options.taskId,
    imageName: options.imageName,
    env: options.env,
    namePrefix: options.namePrefix,
    resources: options.resources,
  });
}
