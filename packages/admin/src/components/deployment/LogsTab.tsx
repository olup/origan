import {
  Box,
  Button,
  Card,
  CardSection,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpcClient } from "../../utils/trpc";

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

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  functionPath?: string;
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

export const LogsTab = ({ deployment }: { deployment: DeploymentData }) => {
  const [isListening, setIsListening] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Get the ScrollArea viewport element
  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
  }, []);

  // Check if user is near bottom
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

  const onToggleSubscription = () => {
    if (isListening) {
      // Unsubscribe
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      setIsListening(false);
    } else {
      // Subscribe to logs
      setIsListening(true);
      const subscription = trpcClient.logs.stream.subscribe(
        { deploymentRef: deployment.reference },
        {
          onData: (log) => {
            setLogs((prev) => [...prev, log]);
          },
          onError: (error) => {
            console.error("Log subscription error:", error);
            setIsListening(false);
            subscriptionRef.current = null;
          },
          onComplete: () => {
            setIsListening(false);
            subscriptionRef.current = null;
          },
        },
      );
      subscriptionRef.current = subscription;
    }
  };

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  // Auto-scroll when new logs appear
  useEffect(() => {
    if (logs.length > 0 && autoScroll) {
      scrollLogsToBottom();
    }
  }, [logs, autoScroll, scrollLogsToBottom]);

  console.log(logs);

  return (
    <Card withBorder padding="xl">
      <Stack>
        <Group justify="space-between">
          <Title order={3}>Runtime Logs</Title>
          <Button
            onClick={onToggleSubscription}
            variant={isListening ? "filled" : "outline"}
            color={isListening ? "red" : "blue"}
          >
            {isListening ? "Stop Listening" : "Start Listening"}
          </Button>
        </Group>

        <CardSection>
          <Stack>
            <ScrollArea.Autosize
              mah={500}
              ref={scrollAreaRef}
              onScrollPositionChange={handleScroll}
            >
              <Box
                bg="dark"
                p="md"
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  minHeight: 100,
                }}
              >
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <Box key={`${log.timestamp}-${index}`}>
                      <Group gap="xs" wrap="nowrap">
                        <Text c="dimmed" size="xs">
                          [{new Date(log.timestamp).toLocaleTimeString()}]
                        </Text>
                        {log.functionPath && (
                          <Text c="cyan" size="xs">
                            {log.functionPath}
                          </Text>
                        )}
                        <Text c={getLogColor(log.level)}>{log.message}</Text>
                      </Group>
                    </Box>
                  ))
                ) : (
                  <Text c="dimmed">
                    {isListening
                      ? "Waiting for logs..."
                      : "Click 'Start Listening' to stream logs"}
                  </Text>
                )}
              </Box>
            </ScrollArea.Autosize>
            {!autoScroll && logs.length > 0 && (
              <Text size="xs" c="dimmed" ta="center">
                Auto-scroll paused. Scroll to bottom to resume.
              </Text>
            )}
          </Stack>
        </CardSection>
      </Stack>
    </Card>
  );
};
