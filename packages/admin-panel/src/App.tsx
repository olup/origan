import {
  AppShell,
  Box,
  Button,
  Container,
  Flex,
  Group,
  Menu,
  Text,
} from "@mantine/core";
import { LogOut, User } from "lucide-react";
import { Sprout } from "lucide-react";
import { Route, Router, Switch, useLocation } from "wouter";
import { useAuth } from "./hooks/useAuth";
import { CreateProjectPage } from "./pages/CreateProjectPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function App() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (!user) return <LoginPage />;

  return (
    <AppShell header={{ height: 60 }} bg="rgb(249, 250, 251)">
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" align="center" justify="space-between">
            <Flex
              align="center"
              style={{ cursor: "pointer" }}
              onClick={() => setLocation("/")}
            >
              <Sprout color="green" style={{ height: 20 }} />
              <Text size="lg" fw={600}>
                Origan
              </Text>
            </Flex>

            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <Button
                  variant="subtle"
                  size="sm"
                  rightSection={<User size={14} />}
                >
                  {user.username}
                </Button>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Account</Menu.Label>
                <Menu.Item>{user.contactEmail}</Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<LogOut size={14} />}
                  onClick={() => useAuth().doLogout()}
                >
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Box py="lg">
          <Router>
            <Switch>
              <Route path="/">
                <ProjectsPage />
              </Route>
              <Route path="/projects/new">
                <CreateProjectPage />
              </Route>
              <Route path="/projects/:id">
                <ProjectPage />
              </Route>
              <Route path="/projects/:id/deployments">
                <ProjectPage />
              </Route>
              <Route path="/projects/:id/settings">
                <ProjectPage />
              </Route>
            </Switch>
          </Router>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
