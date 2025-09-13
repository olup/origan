import {
  Badge,
  Box,
  Button,
  Card,
  CardSection,
  Container,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLogsLength = useRef(0);

  const { data: deployment, refetch } = useQuery({
    ...createQueryHelper(client.deployments["by-ref"][":ref"].$get, {
      param: { ref: reference || "" },
    }),
    enabled: Boolean(reference),
  });

  // Get the ScrollArea viewport element
  const getViewport = useCallback(() => {
    // Mantine ScrollArea viewport has the data attribute
    return scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
  }, []);

  // Check if user is near bottom (within 50px threshold)
  const isNearBottom = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return true;
    const threshold = 50;
    return (
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
      threshold
    );
  }, [getViewport]);

  // Function to scroll logs container to the bottom
  const scrollLogsToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = getViewport();
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior,
        });
      }
    },
    [getViewport],
  );

  // Handle manual scroll detection
  const handleScroll = useCallback(() => {
    setAutoScroll(isNearBottom());
  }, [isNearBottom]);

  // Auto-scroll when new logs appear
  useEffect(() => {
    if (!deployment || "error" in deployment) return;

    const currentLogsLength = deployment.build?.logs?.length || 0;

    // Scroll on initial load or when new logs appear (if auto-scroll is enabled)
    if (currentLogsLength > 0) {
      if (prevLogsLength.current === 0) {
        // Initial load - instant scroll
        scrollLogsToBottom("instant");
      } else if (currentLogsLength > prevLogsLength.current && autoScroll) {
        // New logs - smooth scroll if user hasn't scrolled away
        scrollLogsToBottom("smooth");
      }
    }

    prevLogsLength.current = currentLogsLength;
  }, [deployment, autoScroll, scrollLogsToBottom]);

  // Refetch on interval when deployment is active
  useEffect(() => {
    if (!deployment || "error" in deployment) return;
    if (deployment.status === "success" || deployment.status === "error")
      return;

    const interval = setInterval(() => {
      refetch();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetch, deployment]);

  if (!reference || !deployment) return null;
  if ("error" in deployment) return null;

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
              {deployment.domains.map((domain) => (
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
        )}
        {deployment.status === "pending" ? (
          // Show initialization message when deployment hasn't started
          <Card withBorder padding="xl">
            <Stack align="center" gap="md" py="xl">
              <Loader size="sm" />
              <Text c="dimmed">Deployment is initializing...</Text>
            </Stack>
          </Card>
        ) : deployment.build ? (
          // Show build details and logs when deployment has started
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
                  <ScrollArea.Autosize
                    mah={300}
                    ref={scrollAreaRef}
                    onScrollPositionChange={handleScroll}
                  >
                    <Box
                      bg="dark"
                      p="md"
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {deployment.build.logs.length > 0 ? (
                        <>
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
                        </>
                      ) : (
                        <Text c="dimmed">Waiting for build logs...</Text>
                      )}
                    </Box>
                  </ScrollArea.Autosize>
                  {!autoScroll && deployment.build.status === "in_progress" && (
                    <Text size="xs" c="dimmed" ta="center">
                      Auto-scroll paused. Scroll to bottom to resume.
                    </Text>
                  )}
                </Stack>
              </CardSection>
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Container>
  );
};
