import { useMutation } from "@tanstack/react-query";
import { trpcClient } from "../utils/trpc";

type CreateProjectWithGithubConfigurationInput = {
  projectName: string;
  repoId: number;
  repoName: string;
  branch: string;
  projectRootPath: string;
  organizationReference: string;
};

export const useCreateProjectWithGithubConfiguration = () =>
  useMutation({
    mutationFn: async ({
      projectName,
      repoId,
      repoName,
      branch,
      projectRootPath,
      organizationReference,
    }: CreateProjectWithGithubConfigurationInput) => {
      const project = await trpcClient.projects.create.mutate({
        name: projectName,
        organizationReference,
      });

      await trpcClient.projects.setGithubConfig.mutate({
        reference: project.reference,
        githubRepositoryId: repoId,
        githubRepositoryFullName: repoName,
        productionBranchName: branch,
        projectRootPath,
      });

      return project;
    },
  });
