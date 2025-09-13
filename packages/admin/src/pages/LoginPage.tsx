import { Button, Container, Flex } from "@mantine/core";
import { GithubIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { doLogin } = useAuth();
  return (
    <Container h="100vh" display="flex">
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="md"
        w="100%"
      >
        <Button
          variant="filled"
          color="dark"
          leftSection={<GithubIcon size="1rem" />}
          onClick={() => doLogin()}
        >
          Login
        </Button>
      </Flex>
    </Container>
  );
}
