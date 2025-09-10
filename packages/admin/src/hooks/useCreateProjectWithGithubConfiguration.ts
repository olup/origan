import { useMutation } from "@tanstack/react-query";
import { client } from "../libs/client";
import { safeQuery } from "../utils/honoQuery";

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
      const project = await safeQuery(
        client.projects.$post({
          json: {
            name: projectName,
            organizationReference,
          },
        }),
      );

      await safeQuery(
        client.projects[":reference"].github.config.$post({
          param: { reference: project.reference },
          json: {
            githubRepositoryId: repoId,
            githubRepositoryFullName: repoName,
            productionBranchName: branch,
            projectRootPath,
          },
        }),
      );

      return project;
    },
  });
