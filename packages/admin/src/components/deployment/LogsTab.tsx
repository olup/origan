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
  useMantineColorScheme,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { ensureAccessToken, trpcClient } from "../../utils/trpc";

function getLogColor(level: string, isDark: boolean) {
  switch (level) {
    case "info":
      return isDark ? "white" : "dark";
    case "error":
      return "red";
    case "warn":
      return "orange";
    default:
      return isDark ? "gray" : "dark.3";
  }
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  functionPath?: string;
}

export const LogsTab = () => {
  const params = useParams();
  const reference = params?.reference;
  const { colorScheme } = useMantineColorScheme();

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

  const onToggleSubscription = async () => {
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
      const hasToken = await ensureAccessToken();
      if (!hasToken) {
        console.error("Unable to refresh access token for logs subscription");
        setIsListening(false);
        return;
      }
      const subscription = trpcClient.logs.stream.subscribe(
        { deploymentRef: reference || "" },
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
            console.log("Log subscription completed");
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
                bg={colorScheme === "dark" ? "dark" : "gray.0"}
                p="md"
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  minHeight: 100,
                }}
              >
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <Box
                      key={`${log.timestamp}-${index}`}
                      pb="xs"
                      mb="xs"
                      style={{
                        borderBottom:
                          index < logs.length - 1
                            ? colorScheme === "dark"
                              ? "1px solid rgba(255, 255, 255, 0.1)"
                              : "1px solid rgba(0, 0, 0, 0.1)"
                            : "none",
                      }}
                    >
                      <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Text
                          c="dimmed"
                          size="xs"
                          style={{
                            flexShrink: 0,
                            fontSize: "0.7rem",
                            minWidth: "70px",
                          }}
                        >
                          [{new Date(log.timestamp).toLocaleTimeString()}]
                        </Text>
                        <Text
                          c={getLogColor(log.level, colorScheme === "dark")}
                          style={{
                            wordBreak: "break-word",
                            flex: 1,
                            fontSize: "0.7rem",
                          }}
                        >
                          {log.message}
                        </Text>
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
