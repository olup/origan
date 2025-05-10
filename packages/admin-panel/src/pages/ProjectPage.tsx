import {
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { GithubIcon } from "lucide-react";
import { useParams } from "wouter";
import { client } from "../libs/client";

export const ProjectPage = () => {
  const params = useParams();
  const projectId = params?.id;

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      const res = await client.projects["by-id"][":id"].$get({
        param: { id: projectId },
      });
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      return data;
    },
    enabled: Boolean(projectId),
  });

  if (!projectId || !project) return null;

  return (
    <Container size="xl">
      <Stack gap="xl">
        <Card withBorder padding="xl">
          <Stack>
            <Title order={2}>{project.name}</Title>
            <Group>
              <Text c="dimmed">Project Reference:</Text>
              <Text>{project.reference}</Text>
            </Group>
            {project.githubConfig && (
              <Stack>
                <Badge
                  radius="sm"
                  leftSection={
                    <GithubIcon style={{ height: "10px", width: "auto" }} />
                  }
                >
                  {project.githubConfig.githubRepositoryFullName}
                </Badge>
                <Text c="dimmed">
                  Production branch : {project.githubConfig.productionBranch}
                </Text>
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
