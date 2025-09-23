import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Container,
  Flex,
  Group,
  Menu,
  Text,
} from "@mantine/core";
import { ChevronDown, LogOut, Moon, Sun, User } from "lucide-react";
import { Route, Router, Switch, useLocation } from "wouter";
import { OrganizationSwitcher } from "./components/OrganizationSwitcher";
import { useAuth } from "./contexts/AuthContext";
import { useTheme } from "./contexts/ThemeContext";
import { CreateProjectPage } from "./pages/CreateProjectPage";
import { DeploymentDetailsPage } from "./pages/DeploymentDetailsPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function App() {
  const { user, isLoading, doLogout } = useAuth();
  const { colorScheme, toggleColorScheme } = useTheme();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (!user) return <LoginPage />;

  return (
    <AppShell
      header={{ height: 60 }}
      styles={{
        main: {
          backgroundColor: colorScheme === "dark" ? "#1a1b1e" : "#f8f9fa",
        },
      }}
    >
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" align="center">
            <Flex
              align="center"
              gap="xs"
              style={{ cursor: "pointer" }}
              onClick={() => setLocation("/")}
            >
              <img
                src="/logo.svg"
                alt="origan.dev"
                style={{ height: 24, width: "auto" }}
              />
              <Text size="lg" fw={600}>
                origan.dev
              </Text>
            </Flex>
            <OrganizationSwitcher />
            <Box flex={1} />

            <Group gap="sm">
              <ActionIcon
                onClick={toggleColorScheme}
                variant="subtle"
                color="gray"
                size="lg"
              >
                {colorScheme === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </ActionIcon>
              <Menu shadow="md" width={200} position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    size="sm"
                    leftSection={<User size={14} />}
                    rightSection={<ChevronDown size={14} />}
                  >
                    {user.username}
                  </Button>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Label>{user.contactEmail}</Menu.Label>
                  <Menu.Item
                    color="red"
                    leftSection={<LogOut size={14} />}
                    onClick={doLogout}
                  >
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
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
              <Route path="/projects/:reference">
                <ProjectPage />
              </Route>
              <Route path="/projects/:reference/*">
                <ProjectPage />
              </Route>
              <Route path="/deployments/:reference">
                <DeploymentDetailsPage />
              </Route>
              <Route path="/deployments/:reference/build">
                <DeploymentDetailsPage />
              </Route>
              <Route path="/deployments/:reference/logs">
                <DeploymentDetailsPage />
              </Route>
            </Switch>
          </Router>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
