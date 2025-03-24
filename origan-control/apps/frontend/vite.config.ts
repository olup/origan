import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const viteConfig = defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API requests to the backend port in development
      "/api": "http://localhost:8000",
    },
  },
  build: {
    target: "esnext",
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});

export default viteConfig;
