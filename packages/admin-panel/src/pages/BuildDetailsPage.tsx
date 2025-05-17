import {
  Badge,
  Box,
  Card,
  Code,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "wouter";
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
  const params = useParams();
  const reference = params?.reference;

  const { data: build, refetch } = useQuery({
    ...createQueryHelper(client.builds[":reference"].$get, {
      param: { reference: reference || "" },
    }),
    enabled: Boolean(reference),
  });

  useEffect(() => {
    if (!build) return;
    if (build.status === "completed" || build.status === "failed") return;
    const interval = setInterval(() => {
      refetch();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetch, build]);

  if (!reference || !build) return null;
  if ("error" in build) return null;

  return (
    <Container size="xl">
      <Stack gap="xl">
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
            <Stack>
              <Code block bg="dark" p="md">
                {build.logs.map((log) => (
                  <Box
                    key={`${log.timestamp}-${log.message}`}
                    c={getLogColor(log.level)}
                  >
                    {log.message}
                  </Box>
                ))}
                {build.status === "in_progress" && (
                  <Progress mt={10} color="gray" w={100} value={100} animated />
                )}
              </Code>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
