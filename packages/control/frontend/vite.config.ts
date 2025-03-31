import react from "@vitejs/plugin-react-swc";
import { defineConfig, type ServerOptions } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  let server: ServerOptions = {};

  return {
    plugins: [react()],
    build: {
      target: "esnext",
      outDir: "dist",
    },
    resolve: {
      conditions: ["development", "browser"],
    },
    server: server,
  };
});
