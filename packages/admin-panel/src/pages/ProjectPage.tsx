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

const BuildsList = ({
  projectReference,
}: {
  projectReference: string;
  project: { reference: string };
}) => {
  const [, navigate] = useLocation();
  const { data: builds } = useQuery(
    createQueryHelper(client.builds["by-project"][":projectReference"].$get, {
      param: { projectReference },
    })
  );

  if (!builds?.length) {
    return <Text c="dimmed">No builds yet</Text>;
  }

  const truncatedBuilds = builds.slice(0, 5);

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Status</Table.Th>
          <Table.Th>Branch</Table.Th>
          <Table.Th>Commit</Table.Th>
          <Table.Th>Deployment</Table.Th>
          <Table.Th>Created At</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {truncatedBuilds.map((build) => (
          <Table.Tr
            key={build.id}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/builds/${build.reference}`)}
          >
            <Table.Td>
              <Badge color={getStatusColor(build.status)}>{build.status}</Badge>
            </Table.Td>
            <Table.Td>{build.branch}</Table.Td>
            <Table.Td>{build.commitSha.substring(0, 7)}</Table.Td>
            <Table.Td>
              {build.buildUrl && (
                <Group gap="xs">
                  <Text
                    component="a"
                    href={build.buildUrl}
                    target="_blank"
                    c="blue"
                    size="sm"
                    style={{ textDecoration: "underline" }}
                  >
                    Open
                  </Text>
                </Group>
              )}
            </Table.Td>
            <Table.Td>{new Date(build.createdAt).toLocaleString()}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

export const ProjectPage = () => {
  const params = useParams();
  const projectReference = params?.reference;

  const { data: project } = useQuery({
    ...createQueryHelper(client.projects[":reference"].$get, {
      param: { reference: projectReference || "" },
    }),
    enabled: Boolean(projectReference),
  });

  if (!projectReference || !project) return null;
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
                  component="a"
                  href={`https://github.com/${project.githubConfig.githubRepositoryFullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  radius="sm"
                  variant="outline"
                  color="black"
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
            <BuildsList projectReference={projectReference} project={project} />
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
