import { createTheme, MantineProvider } from "@mantine/core";
import App from "../App";
import { useTheme } from "../contexts/ThemeContext";

const mantineTheme = createTheme({
  fontFamily: "Fira Code, sans-serif",
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
      <App />
    </MantineProvider>
  );
}
