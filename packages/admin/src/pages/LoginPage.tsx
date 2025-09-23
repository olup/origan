import { Button, Container, Flex, Text } from "@mantine/core";
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
        gap="xl"
        w="100%"
      >
        <Flex align="center" direction="column" gap="xs">
          <img
            src="/logo.svg"
            alt="origan.dev"
            style={{ height: 48, width: "auto" }}
          />
          <Text size="xl" fw={600}>
            origan.dev
          </Text>
        </Flex>
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
