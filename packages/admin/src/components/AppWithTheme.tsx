import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import App from "../App";
import { useTheme } from "../contexts/ThemeContext";

const mantineTheme = createTheme({
  fontFamily: "'Space Mono', monospace",
  defaultRadius: "sm",
  components: {
    Button: {
      defaultProps: {
        variant: "outline",
      },
    },
  },
});

export function AppWithTheme() {
  const { colorScheme } = useTheme();

  const dynamicTheme = createTheme({
    ...mantineTheme,
    components: {
      Button: {
        defaultProps: {
          variant: "outline",
          color: colorScheme === "dark" ? "gray" : "black",
        },
      },
    },
  });

  return (
    <MantineProvider
      theme={dynamicTheme}
      defaultColorScheme={colorScheme}
      forceColorScheme={colorScheme}
    >
      <Notifications />
      <App />
    </MantineProvider>
  );
}
