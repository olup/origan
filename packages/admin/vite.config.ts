import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type ServerOptions } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useProxy = env.VITE_USE_PROXY === "true";
  const apiUrl = env.VITE_API_URL || "http://localhost:9999";

  const server: ServerOptions = {
    port: 5199,
  };

  // Add proxy configuration for development with production API
  if (mode === "development" && useProxy) {
    server.proxy = {
      "/api": {
        target: apiUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // Forward cookies from the client
            const cookies = proxyReq.getHeader("cookie");
            if (cookies) {
              proxyReq.setHeader("cookie", cookies);
            }
          });
          proxy.on("proxyRes", (proxyRes) => {
            // Handle Set-Cookie headers properly
            const setCookies = proxyRes.headers["set-cookie"];
            if (setCookies) {
              // Modify cookies to work with localhost
              proxyRes.headers["set-cookie"] = setCookies.map(
                (cookie: string) => {
                  return cookie
                    .replace(/Domain=[^;]+;?/gi, "") // Remove domain restriction
                    .replace(/Secure;?/gi, "") // Remove secure flag for localhost
                    .replace(/SameSite=\w+;?/gi, "SameSite=Lax;"); // Ensure SameSite=Lax
                },
              );
            }
          });
        },
      },
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
