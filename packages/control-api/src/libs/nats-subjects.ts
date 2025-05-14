export const subjects = {
  builds: {
    /**
     * Subject for build status events
     * @param buildId - The build ID, defaults to "*" for wildcard subscription
     */
    status: (buildId = "*") => `builds.${buildId}.status`,

    /**
     * Subject for build log events
     * @param buildId - The build ID, defaults to "*" for wildcard subscription
     */
    logs: (buildId = "*") => `builds.${buildId}.logs`,
  },
  deployments: {
    /**
     * Subject for deployment log events
     * @param projectId - The project ID
     * @param deploymentId - The deployment ID
     */
    logs: (projectId: string, deploymentId: string) =>
      `logs.${projectId}.${deploymentId}`,
  },
};
