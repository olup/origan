import {
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Space,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon, RocketIcon } from "lucide-react";
import { useLocation } from "wouter";
import { client } from "../libs/client";

export const ProjectsPage = () => {
  const [, navigate] = useLocation();
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
    <Container size="xl">
      <Stack>
        <Group>
          <Title order={2}>Projects</Title>
          <Space flex={1} />
          <Button
            rightSection={<RocketIcon size={18} />}
            onClick={() => navigate("/projects/new")}
          >
            Deploy project from Github
          </Button>
        </Group>

        <SimpleGrid cols={3} spacing="lg">
          {projects?.data?.map((project) => (
            <Card
              key={project.id}
              withBorder
              padding="lg"
              radius="md"
              onClick={() => navigate(`/projects/${project.id}`)}
              styles={{
                root: {
                  backgroundColor: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  cursor: "pointer",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 3px 6px rgba(0,0,0,0.1)",
                  },
                },
              }}
            >
              <Group>
                <FolderIcon size={20} strokeWidth={1.5} />
                <Text fw={500} size="lg">
                  {project.name}
                </Text>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
};
