import {
  Badge,
  Box,
  Button,
  Card,
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
import { client } from "../libs/client";
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

export const BuildDetailsPage = () => {
  const [, navigate] = useLocation();
  const params = useParams();
  const reference = params?.reference;
  const osComponentRef = useRef<HTMLDivElement>(null);

  const { data: build, refetch } = useQuery({
    ...createQueryHelper(client.builds[":reference"].$get, {
      param: { reference: reference || "" },
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

  // Refetch and scroll on build status
  useEffect(() => {
    if (!build) return;
    if (build.status === "completed" || build.status === "failed") return;

    // Initial scroll to bottom
    scrollLogsToBottom();

    const interval = setInterval(() => {
      refetch();
      scrollLogsToBottom();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetch, build, scrollLogsToBottom]);

  // Effect to auto-scroll when logs change
  useEffect(() => {
    if (build?.logs && build.status === "in_progress") {
      scrollLogsToBottom();
    }
  }, [build?.logs, build?.status, scrollLogsToBottom]);

  if (!reference || !build) return null;
  if ("error" in build) return null;

  return (
    <Container size="xl">
      <Stack gap="sm">
        <Box>
          <Button
            variant="subtle"
            color="black"
            leftSection={<ArrowLeftIcon size="1rem" />}
            onClick={() => navigate(`/projects/${build.project.reference}`)}
          >
            Back to project
          </Button>
        </Box>
        <Card withBorder padding="xl">
          <Stack>
            <Title order={2}>Build Details</Title>
            <Group>
              <Text fw={500}>Status:</Text>
              <Badge color={getStatusColor(build.status)}>{build.status}</Badge>
            </Group>
            <Group>
              <Text fw={500}>Branch:</Text>
              <Text>{build.branch}</Text>
            </Group>
            <Group>
              <Text fw={500}>Commit:</Text>
              <Text>{build.commitSha}</Text>
            </Group>
            <Group>
              <Text fw={500}>Created:</Text>
              <Text>{new Date(build.createdAt).toLocaleString()}</Text>
            </Group>
            {build.buildStartedAt && build.status !== "pending" && (
              <Group>
                <Text fw={500}>Duration:</Text>
                <Text>
                  {build.buildEndedAt
                    ? formatDuration(
                        new Date(build.buildStartedAt),
                        new Date(build.buildEndedAt),
                      )
                    : formatDuration(
                        new Date(build.buildStartedAt),
                        new Date(),
                      )}
                </Text>
              </Group>
            )}
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
                  {build.logs.map((log, index) => (
                    <Box
                      // biome-ignore lint/suspicious/noArrayIndexKey: no other way to make a key
                      key={index}
                      c={getLogColor(log.level)}
                    >
                      {log.message}
                    </Box>
                  ))}
                  {build.status === "in_progress" && <Box c="gray">...</Box>}
                </Box>
              </ScrollArea.Autosize>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
