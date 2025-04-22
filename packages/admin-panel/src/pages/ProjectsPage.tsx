import {
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Space,
  Stack,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { client } from "../libs/client";

export const ProjectsPage = () => {
  const projects = useQuery({
    queryKey: [client.projects.$url().toString()],
    queryFn: () =>
      client.projects.$get().then((res) => {
        if (!res.ok) {
          return null;
        }
        return res.json();
      }),
  });

  return (
    <Stack>
      <Group>
        <Title order={2}>Projects</Title>
        <Space flex={1} />
        <Button rightSection={<PlusIcon />}>Create project</Button>
      </Group>

      <SimpleGrid cols={3} spacing="lg">
        {projects?.data?.map((project) => (
          <Card withBorder key={project.id}>
            <Box key={project.id}>{project.name}</Box>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
};
