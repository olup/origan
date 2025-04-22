import { Container } from "@mantine/core";
import { Route, Router } from "wouter";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) return <LoginPage />;

  return (
    <Container h="100vh" pt={20}>
      <Router>
        <Route path="/">
          <ProjectsPage />
        </Route>
      </Router>
    </Container>
  );
}

export default App;
