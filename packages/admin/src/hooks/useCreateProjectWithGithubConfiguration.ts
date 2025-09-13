import { useMutation } from "@tanstack/react-query";
import { trpc } from "../utils/trpc";

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
      const project = await trpc.projects.create.mutate({
        name: projectName,
        organizationReference,
      });

      await trpc.projects.setGithubConfig.mutate({
        reference: project.reference,
        githubRepositoryId: repoId,
        githubRepositoryFullName: repoName,
        productionBranchName: branch,
        projectRootPath,
      });

      return project;
    },
  });
