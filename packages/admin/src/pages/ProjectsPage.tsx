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
import { FolderIcon, RocketIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useOrganization } from "../contexts/OrganizationContext";
import { trpc } from "../utils/trpc";

export const ProjectsPage = () => {
  const [, navigate] = useLocation();
  const { selectedOrganization } = useOrganization();

  const projects = trpc.projects.list.useQuery(
    { organizationReference: selectedOrganization?.reference ?? "" },
    { enabled: !!selectedOrganization },
  );

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
          {projects.data?.map((project) => (
            <Card
              key={project.id}
              withBorder
              padding="lg"
              onClick={() => navigate(`/projects/${project.reference}`)}
              styles={{
                root: {
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
