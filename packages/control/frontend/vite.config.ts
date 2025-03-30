import react from "@vitejs/plugin-react-swc";
import { defineConfig, type ServerOptions } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  let server: ServerOptions = {};
  if (mode === "development") {
    server = {
      proxy: {
        "/api": {
          target: process.env.PROXY_API_URL || "http://localhost:9999",
          changeOrigin: false,
        },
      },
      cors: true,
    };
  }

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
