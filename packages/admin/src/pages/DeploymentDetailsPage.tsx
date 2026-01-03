import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Hammer, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation, useParams } from "wouter";
import { BuildTab } from "../components/deployment/BuildTab";
import { LogsTab } from "../components/deployment/LogsTab";
import { trpc } from "../utils/trpc";

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

export const DeploymentDetailsPage = () => {
  const [location, navigate] = useLocation();
  const params = useParams();
  const reference = params?.reference;
  const [activeTab, setActiveTab] = useState<string | null>("build");

  const { data: deployment } = useQuery(
    trpc.deployments.getByRef.queryOptions(
      { ref: reference || "" },
      { enabled: Boolean(reference) },
    ),
  );

  // Update active tab based on URL
  useEffect(() => {
    const path = location.split("/").pop();
    if (path === "logs") {
      setActiveTab("logs");
    } else if (path === "build" || path === reference) {
      setActiveTab("build");
    }
  }, [location, reference]);

  // Deployment refreshes are driven by SSE events in the Build/Logs tabs.

  if (!reference || !deployment) return null;
  if ("error" in deployment) return null;

  const handleTabChange = (value: string | null) => {
    setActiveTab(value);
    if (value === "logs") {
      navigate(`/deployments/${reference}/logs`);
    } else {
      navigate(`/deployments/${reference}/build`);
    }
  };

  return (
    <Container size="xl">
      <Stack gap="sm">
        <Box>
          <Button
            variant="subtle"
            leftSection={<ArrowLeftIcon size="1rem" />}
            onClick={() =>
              navigate(`/projects/${deployment?.project.reference}`)
            }
          >
            Back to project
          </Button>
        </Box>

        <Card withBorder padding="xl">
          <Stack>
            <Title order={2}>Deployment Details</Title>
            <Group>
              <Text fw={500}>Status:</Text>
              <Badge color={getStatusColor(deployment.status)}>
                {deployment.status}
              </Badge>
            </Group>
          </Stack>
        </Card>

        {deployment.domains && deployment.domains.length > 0 && (
          <Card withBorder padding="xl">
            <Stack>
              <Title order={4}>URLs</Title>
              {deployment.domains.map((domain) => {
                const url = `https://${domain.name}`;
                return (
                  <Text key={domain.id}>
                    <Text
                      component="a"
                      href={url}
                      target="_blank"
                      c="blue"
                      style={{ textDecoration: "underline" }}
                    >
                      {url}
                    </Text>
                  </Text>
                );
              })}
            </Stack>
          </Card>
        )}

        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List>
            <Tabs.Tab value="build" leftSection={<Hammer size={16} />}>
              Build
            </Tabs.Tab>
            {/* Only show Logs tab when deployment is successful */}
            {deployment.status === "success" && (
              <Tabs.Tab value="logs" leftSection={<Terminal size={16} />}>
                Logs
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs>

        <Box pt="md">
          <Switch>
            <Route path="/deployments/:reference/logs">
              {deployment.status === "success" ? (
                <LogsTab />
              ) : (
                <Card withBorder padding="xl">
                  <Stack align="center" gap="md">
                    <Text c="dimmed">
                      Logs will be available once the deployment is successful
                    </Text>
                  </Stack>
                </Card>
              )}
            </Route>
            <Route path="/deployments/:reference/build">
              <BuildTab />
            </Route>
            <Route path="/deployments/:reference">
              <BuildTab />
            </Route>
          </Switch>
        </Box>
      </Stack>
    </Container>
  );
};
