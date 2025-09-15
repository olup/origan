import {
  Box,
  Card,
  CardSection,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface DeploymentData {
  reference: string;
  status: string;
  project: { reference: string };
  domains?: Array<{ id: string; name: string }>;
  build?: {
    commitSha: string;
    createdAt: string;
    buildStartedAt?: string;
    buildEndedAt?: string;
    status: string;
    logs: Array<{ level: string; message: string }>;
  };
}

export const BuildTab = ({ deployment }: { deployment: DeploymentData }) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLogsLength = useRef(0);

  // Refetch on interval when deployment is active
  useEffect(() => {
    if (!deployment || "error" in deployment) return;
    if (deployment.status === "success" || deployment.status === "error")
      return;

    const interval = setInterval(() => {
      // Parent component should handle refetch
    }, 1000);
    return () => clearInterval(interval);
  }, [deployment]);

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

  if (!deployment || "error" in deployment) return null;

  return (
    <Card withBorder padding="xl">
      <Stack>
        <Title order={3}>Build Details</Title>
        {deployment.status === "pending" ? (
          <Stack align="center" gap="md" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">Deployment is initializing...</Text>
          </Stack>
        ) : deployment.build ? (
          <>
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
                  mah={400}
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
          </>
        ) : (
          <Text c="dimmed">No build information available</Text>
        )}
      </Stack>
    </Card>
  );
};
