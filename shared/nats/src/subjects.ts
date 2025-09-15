export const STREAM_NAMES = {
  BUILD_EVENTS: "BUILD_EVENTS_STREAM",
  DEPLOYMENT_EVENTS: "DEPLOYMENT_EVENTS_STREAM",
} as const;

export const subjects = {
  builds: {
    status: (buildId = "*") => `builds.${buildId}.status`,
    logs: (buildId = "*") => `builds.${buildId}.logs`,
  },
  deployments: {
    logs: (projectId: string, deploymentId: string, functionHash = "*") =>
      `logs.${projectId}.${deploymentId}.${functionHash}`,
  },
} as const;

export type BuildSubject =
  | ReturnType<typeof subjects.builds.status>
  | ReturnType<typeof subjects.builds.logs>;
export type DeploymentSubject = ReturnType<typeof subjects.deployments.logs>;
export type Subject = BuildSubject | DeploymentSubject;
