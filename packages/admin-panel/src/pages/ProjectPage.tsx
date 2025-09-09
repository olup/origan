import {
  Badge,
  Box,
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
import { Link, Route, useLocation, useParams } from "wouter";
import { EnvironmentManager } from "../components/EnvironmentManager";
import { client } from "../libs/client";
import { createQueryHelper } from "../utils/honoQuery.js";

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "green";
    case "error":
      return "red";
    case "building":
    case "deploying":
      return "teal";
    default:
      return "gray";
  }
}

const DeploymentsList = ({
  projectReference,
}: {
  projectReference: string;
}) => {
  const [, navigate] = useLocation();
  const { data: deploymentsResponse } = useQuery(
    createQueryHelper(
      client.deployments["by-project-ref"][":projectReference"].$get,
      {
        param: { projectReference },
      },
    ),
  );

  if (deploymentsResponse && "error" in deploymentsResponse) {
    return (
      <Text c="red">
        Failed to load deployments: {deploymentsResponse.error}
      </Text>
    );
  }

  const deployments = deploymentsResponse?.deployments || [];

  if (!deployments.length) {
    return <Text c="dimmed">No deployments yet</Text>;
  }

  const truncatedDeployments = deployments.slice(0, 20);

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Status</Table.Th>
          <Table.Th>Track</Table.Th>
          <Table.Th>Commit</Table.Th>
          <Table.Th>Deployment</Table.Th>
          <Table.Th>Created At</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {truncatedDeployments.map((deployment) => {
          const deploymentTrackName = deployment.track?.name || "";
          const deploymentIsTrackLive = deployment.domains?.some(
            (domain) => domain.trackId === deployment.track?.id,
          );
          return (
            <Table.Tr
              key={deployment.reference}
              style={{ cursor: "pointer" }}
              onClick={() => navigate(`/deployments/${deployment.reference}`)}
            >
              <Table.Td>
                <Badge color={getStatusColor(deployment.status)}>
                  {deployment.status}
                </Badge>
              </Table.Td>
              <Table.Td>
                {deploymentTrackName && (
                  <Badge variant={deploymentIsTrackLive ? "filled" : "light"}>
                    {deploymentTrackName}
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>{deployment.build?.commitSha.substring(0, 7)}</Table.Td>
              <Table.Td>
                {deployment.domains.map((domain) => (
                  <Group gap="xs" key={domain.name}>
                    <Text
                      component="a"
                      href={domain.url}
                      target="_blank"
                      c="blue"
                      size="sm"
                      style={{ textDecoration: "underline" }}
                    >
                      Open
                    </Text>
                  </Group>
                ))}
              </Table.Td>
              <Table.Td>
                {new Date(deployment.createdAt).toLocaleString()}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
};

const TabLink = ({
  href,
  children,
  isActive,
}: {
  href: string;
  children: React.ReactNode;
  isActive: boolean;
}) => {
  return (
    <Box
      component={Link}
      href={href}
      style={{
        padding: "8px 16px",
        borderBottom: isActive ? "2px solid #228be6" : "2px solid transparent",
        color: isActive ? "#228be6" : "#868e96",
        textDecoration: "none",
        fontWeight: isActive ? 600 : 400,
        transition: "all 0.2s ease",
        "&:hover": {
          color: "#228be6",
        },
      }}
    >
      {children}
    </Box>
  );
};

const ProjectSettings = ({
  projectReference,
}: {
  projectReference: string;
}) => {
  return (
    <Card withBorder padding="xl">
      <Stack>
        <Title order={3}>Environment Variables</Title>
        <EnvironmentManager projectReference={projectReference} />
      </Stack>
    </Card>
  );
};

const ProjectDeployments = ({
  projectReference,
}: {
  projectReference: string;
}) => {
  return (
    <Card withBorder padding="xl">
      <Stack>
        <Title order={3}>Deployments</Title>
        <DeploymentsList projectReference={projectReference} />
      </Stack>
    </Card>
  );
};

export const ProjectPage = () => {
  const params = useParams();
  const [location] = useLocation();
  const projectReference = params?.reference;

  const { data: project } = useQuery({
    ...createQueryHelper(client.projects[":reference"].$get, {
      param: { reference: projectReference || "" },
    }),
    enabled: Boolean(projectReference),
  });

  if (!projectReference || !project) return null;
  if ("error" in project) return null;

  // Determine active tab based on current route
  const isSettingsTab = location.includes("/settings");
  const activeTab = isSettingsTab ? "settings" : "deployments";

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

        {/* Tab Navigation */}
        <Box>
          <Group gap={0} style={{ borderBottom: "1px solid #e9ecef" }}>
            <TabLink
              href={`/projects/${projectReference}`}
              isActive={activeTab === "deployments"}
            >
              Deployments
            </TabLink>
            <TabLink
              href={`/projects/${projectReference}/settings`}
              isActive={activeTab === "settings"}
            >
              Settings
            </TabLink>
          </Group>
        </Box>

        {/* Tab Content - Using Switch and Route */}
        <Route path="/projects/:reference">
          {() => <ProjectDeployments projectReference={projectReference} />}
        </Route>
        <Route path="/projects/:reference/settings">
          {() => <ProjectSettings projectReference={projectReference} />}
        </Route>
      </Stack>
    </Container>
  );
};
