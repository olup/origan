import { useMutation } from "@tanstack/react-query";
import { client } from "../libs/client";
import { safeQuery } from "../utils/honoQuery";

export const useCreateProjectWithGithubConfiguration = () =>
  useMutation({
    mutationFn: async (input: {
      projectName: string;
      repoId: number;
      repoName: string;
      branch: string;
      projectRootPath?: string;
    }) => {
      const { projectName, repoId, repoName, branch, projectRootPath } = input;

      const project = await safeQuery(
        client.projects.$post({
          json: {
            name: projectName,
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
