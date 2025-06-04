import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm, zodResolver } from "@mantine/form";
import { useQuery } from "@tanstack/react-query";
import { Link2Icon, RefreshCw, RefreshCwIcon, Settings2 } from "lucide-react";
import { useLocation } from "wouter";
import { z } from "zod";
import { getConfig } from "../config";
import { useAuth } from "../hooks/useAuth";
import { useCreateProjectWithGithubConfiguration } from "../hooks/useCreateProjectWithGithubConfiguration";
import { client } from "../libs/client";
import { createQueryHelper } from "../utils/honoQuery";

const toUrlSafe = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const formSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  repoId: z.number().refine((val) => val !== null, {
    message: "Please select a repository",
  }),
  mainBranchName: z.string().refine((val) => val !== null, {
    message: "Please select a production branch",
  }),
});

export const CreateProjectPage = () => {
  const { user, refetchUser, isLoading: isLoadingUser } = useAuth();
  const [, navigate] = useLocation();

  // form
  const form = useForm({
    initialValues: {
      repoId: null as number | null,
      name: "" as string,
      mainBranchName: null as string | null,
    },
    validate: zodResolver(formSchema),
  });

  // query hooks
  const { data: userRepositories, refetch: onRefreshRepos } = useQuery({
    ...createQueryHelper(client.github.repos.$get),
    enabled: !!user?.githubAppInstallationId,
  });

  const { data: branches, refetch: onRefreshBranches } = useQuery({
    ...createQueryHelper(
      client.github.repos[":githubRepositoryId"].branches.$get,
      {
        param: {
          githubRepositoryId: form.values.repoId?.toString() || "",
        },
      },
    ),
    enabled: form.values.repoId !== null,
  });

  const { mutateAsync: createProject, isPending: isLoadingCreateProject } =
    useCreateProjectWithGithubConfiguration();

  // methods
  const handleRepoSelect = (repoId: number | null) => {
    form.setFieldValue("repoId", repoId);
    form.setFieldValue("branch", "");

    if (repoId !== null) {
      const selectedRepo = userRepositories?.find((repo) => repo.id === repoId);
      if (selectedRepo) {
        form.setFieldValue("name", toUrlSafe(selectedRepo.name));
      }
    } else {
      form.setFieldValue("name", "");
    }
  };

  // Will create the project and attach the github config to it
  const handleCreateProject = async (input: z.infer<typeof formSchema>) => {
    const projectSafeName = toUrlSafe(input.name);
    const repository = userRepositories?.find(
      (repo) => repo.id === input.repoId,
    );
    if (!repository) {
      throw new Error("Repository not found");
    }

    const project = await createProject({
      projectName: projectSafeName,
      repoId: input.repoId,
      repoName: repository.fullName,
      branch: input.mainBranchName,
    });

    navigate(`/projects/${project.reference}`);
  };

  const handleSubmit = async (values: typeof form.values) => {
    console.log("Form values", values);
    // recasting type as validation is done
    await handleCreateProject(values as z.infer<typeof formSchema>);
  };

  const githubSharingSettingsUrl = `https://github.com/apps/${
    getConfig().ghAppName
  }/installations/new`;

  const projectUrl = form.values.name
    ? `${form.values.name}.origan.app`
    : "project-name.origan.app";

  console.log(form.values);

  if (!user?.githubAppInstallationId) {
    return (
      <Container size="sm">
        <Stack gap="xl">
          <Title order={2}>Create New Project</Title>

          <Card withBorder>
            <Stack>
              <Text size="sm" fw={500}>
                GitHub App not installed
              </Text>
              <Text size="xs" c="dimmed">
                You need to install the GitHub App to create a project from a
                repository.
              </Text>
              <Group>
                <Button
                  component="a"
                  href={githubSharingSettingsUrl}
                  target="_blank"
                  leftSection={<Link2Icon height="1rem" />}
                >
                  Link github account
                </Button>
                <Button
                  variant="outline"
                  leftSection={<RefreshCwIcon height="1rem" />}
                  onClick={() => refetchUser()}
                  loading={isLoadingUser}
                >
                  Refresh
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="sm">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="xl">
          <Title order={2}>Create New Project</Title>

          <Card withBorder>
            <Stack>
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  GitHub Repository
                </Text>
                <Group gap={"xs"}>
                  <Select
                    style={{ flex: 1 }}
                    placeholder="Search repositories..."
                    data={userRepositories?.map((repo) => ({
                      value: repo.id.toString(),
                      label: repo.name,
                    }))}
                    clearable
                    value={form.values.repoId?.toString()}
                    onChange={(v) =>
                      handleRepoSelect(v ? Number.parseInt(v, 10) : null)
                    }
                  />
                  <Tooltip label="Refresh repositories">
                    <ActionIcon
                      variant="default"
                      onClick={() => onRefreshRepos()}
                      size="lg"
                    >
                      <RefreshCw size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Update GitHub sharing preferences">
                    <ActionIcon
                      variant="default"
                      component="a"
                      href={githubSharingSettingsUrl}
                      target="_blank"
                      size="lg"
                    >
                      <Settings2 size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text size="xs" c="dimmed">
                  Choose a repository to create your project from
                </Text>
              </Stack>

              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Project Name
                </Text>
                <TextInput
                  placeholder="my-awesome-project"
                  required
                  {...form.getInputProps("name")}
                />
                <Text size="xs" c="dimmed">
                  Your project will be available at {projectUrl}
                </Text>
              </Stack>

              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Production Branch
                </Text>
                <Group gap={"xs"}>
                  <Select
                    style={{ flex: 1 }}
                    placeholder="Select a branch"
                    data={branches?.map((branch) => ({
                      value: branch.name,
                      label: branch.name,
                    }))}
                    disabled={!form.values.repoId}
                    required
                    searchable
                    {...form.getInputProps("mainBranchName")}
                  />
                  <Tooltip label="Refresh branches">
                    <ActionIcon
                      variant="default"
                      onClick={() => onRefreshBranches()}
                      disabled={!form.values.repoId}
                      size="lg"
                    >
                      <RefreshCw size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Text size="xs" c="dimmed">
                  Select the branch to deploy in production
                </Text>
              </Stack>

              <Button type="submit" loading={isLoadingCreateProject} fullWidth>
                Create Project
              </Button>
            </Stack>
          </Card>
        </Stack>
      </form>
    </Container>
  );
};
