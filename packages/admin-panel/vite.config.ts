import react from "@vitejs/plugin-react-swc";
import { type ServerOptions, defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const server: ServerOptions = {
    port: 5199,
  };

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
