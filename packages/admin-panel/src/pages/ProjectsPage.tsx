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
import { useOrganization } from "../contexts/OrganizationContext";
import { client } from "../libs/client";

export const ProjectsPage = () => {
  const [, navigate] = useLocation();
  const { selectedOrganization } = useOrganization();

  const projects = useQuery({
    queryKey: ["projects", selectedOrganization?.reference],
    queryFn: () => {
      if (!selectedOrganization) return null;

      return client.projects
        .$get({
          query: { organizationReference: selectedOrganization.reference },
        })
        .then((res) => {
          if (!res.ok) {
            return null;
          }
          return res.json();
        });
    },
    enabled: !!selectedOrganization,
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
              onClick={() => navigate(`/projects/${project.reference}`)}
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
