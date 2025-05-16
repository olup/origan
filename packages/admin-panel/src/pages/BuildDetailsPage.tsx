import {
  Badge,
  Box,
  Card,
  Code,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
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

  const { data: build } = useQuery({
    ...createQueryHelper(client.builds[":reference"].$get, {
      param: { reference: reference || "" },
    }),
    enabled: Boolean(reference),
  });

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
              <Text fw={500}>Logs:</Text>
              <Code block bg="dark" p="md">
                {build.logs.map((log) => (
                  <Box
                    key={`${log.timestamp}-${log.message}`}
                    c={getLogColor(log.level)}
                  >
                    {log.message}
                  </Box>
                ))}
              </Code>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
