import {
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { GithubIcon } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { client } from "../libs/client";
import { createQueryHelper } from "../utils/honoQuery.js";

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "green";
    case "failed":
      return "red";
    case "in_progress":
      return "blue";
    default:
      return "gray";
  }
}

const BuildsList = ({ projectId }: { projectId: string }) => {
  const [, navigate] = useLocation();
  const { data: builds } = useQuery(
    createQueryHelper(client.builds["by-project"][":projectId"].$get, {
      param: { projectId },
    })
  );

  if (!builds?.length) {
    return <Text c="dimmed">No builds yet</Text>;
  }

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Status</Table.Th>
          <Table.Th>Branch</Table.Th>
          <Table.Th>Commit</Table.Th>
          <Table.Th>Created At</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {builds.map((build) => (
          <Table.Tr
            key={build.id}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/builds/${build.id}`)}
          >
            <Table.Td>
              <Badge color={getStatusColor(build.status)}>{build.status}</Badge>
            </Table.Td>
            <Table.Td>{build.branch}</Table.Td>
            <Table.Td>{build.commitSha.substring(0, 7)}</Table.Td>
            <Table.Td>{new Date(build.createdAt).toLocaleString()}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

export const ProjectPage = () => {
  const params = useParams();
  const projectId = params?.id;

  const { data: project } = useQuery({
    ...createQueryHelper(client.projects["by-id"][":id"].$get, {
      param: { id: projectId || "" },
    }),
    enabled: Boolean(projectId),
  });

  if (!projectId || !project) return null;
  if ("error" in project) return null;

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
              </Stack>
            )}
          </Stack>
        </Card>

        <Card withBorder padding="xl">
          <Stack>
            <Title order={3}>Builds</Title>
            <BuildsList projectId={projectId} />
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
