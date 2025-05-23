import { MantineProvider, createTheme } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/fira-code/400.css";
import "./index.css";
import "@mantine/core/styles.css";
import App from "./App";

const queryClient = new QueryClient();
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const mantineTheme = createTheme({
  fontFamily: "Fira Code, sans-serif",
});
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={mantineTheme}>
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
