import {
  Badge,
  Box,
  Button,
  Card,
  CardSection,
  Container,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { client } from "../libs/client.js";
import { createQueryHelper } from "../utils/honoQuery.js";

// Format duration between two dates as "X min Y sec" or "X hr Y min Z sec" if hours > 0
function formatDuration(startDate: Date, endDate: Date): string {
  const durationMs = endDate.getTime() - startDate.getTime();
  const seconds = Math.floor(durationMs / 1000) % 60;
  const minutes = Math.floor(durationMs / 1000 / 60) % 60;
  const hours = Math.floor(durationMs / 1000 / 60 / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min ${seconds} sec`;
  }
  return `${minutes} min ${seconds} sec`;
}

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

function getLogColor(level: string) {
  switch (level) {
    case "info":
      return "white";
    case "error":
      return "red";
    case "warn":
      return "orange";
    default:
      return "gray";
  }
}

export const DeploymentDetailsPage = () => {
  const [, navigate] = useLocation();
  const params = useParams();
  const reference = params?.reference;
  const osComponentRef = useRef<HTMLDivElement>(null);

  const { data: deployment, refetch } = useQuery({
    ...createQueryHelper(client.deployments["by-ref"][":ref"].$get, {
      param: { ref: reference || "" },
    }),
    enabled: Boolean(reference),
  });

  // Function to scroll logs container to the bottom
  const scrollLogsToBottom = useCallback(() => {
    osComponentRef.current?.scrollTo({
      top: osComponentRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Refetch and scroll on deployment status
  useEffect(() => {
    if (!deployment || "error" in deployment) return;
    if (deployment.status === "success" || deployment.status === "error")
      return;

    // Initial scroll to bottom
    scrollLogsToBottom();

    const interval = setInterval(() => {
      refetch();
      scrollLogsToBottom();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetch, deployment, scrollLogsToBottom]);

  if (!reference || !deployment) return null;
  if ("error" in deployment) return null;

  return (
    <Container size="xl">
      <Stack gap="sm">
        <Box>
          <Button
            variant="subtle"
            color="black"
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

        <Card withBorder padding="xl">
          <Stack>
            {deployment.domains?.map((domain) => (
              <Text key={domain.id}>
                <Text
                  component="a"
                  href={domain.url}
                  target="_blank"
                  c="blue"
                  style={{ textDecoration: "underline" }}
                >
                  {domain.url}
                </Text>
              </Text>
            ))}
          </Stack>
        </Card>
        {deployment.build && (
          <Card withBorder padding="xl">
            <Stack>
              <Title order={3}>Build Details</Title>
              <Group>
                <Text fw={500}>Commit:</Text>
                <Text>{deployment.build.commitSha}</Text>
              </Group>
              <Group>
                <Text fw={500}>Created:</Text>
                <Text>
                  {new Date(deployment.build.createdAt).toLocaleString()}
                </Text>
              </Group>
              {deployment.build.buildStartedAt &&
                deployment.build.status !== "pending" && (
                  <Group>
                    <Text fw={500}>Duration:</Text>
                    <Text>
                      {deployment.build.buildEndedAt
                        ? formatDuration(
                            new Date(deployment.build.buildStartedAt),
                            new Date(deployment.build.buildEndedAt),
                          )
                        : formatDuration(
                            new Date(deployment.build.buildStartedAt),
                            new Date(),
                          )}
                    </Text>
                  </Group>
                )}
              <CardSection>
                <Stack>
                  <ScrollArea.Autosize mah={300}>
                    <Box
                      ref={osComponentRef}
                      bg="dark"
                      p="md"
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {deployment.build.logs.map((log, index) => (
                        <Box
                          // biome-ignore lint/suspicious/noArrayIndexKey: no other way to make a key
                          key={index}
                          c={getLogColor(log.level)}
                        >
                          {log.message}
                        </Box>
                      ))}
                      {deployment.build.status === "in_progress" && (
                        <Box c="gray">...</Box>
                      )}
                    </Box>
                  </ScrollArea.Autosize>
                </Stack>
              </CardSection>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
};
