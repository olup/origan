const workerCode = `
import { Buffer } from "node:buffer";

export default {
  fetch() {
    const envValue = process.env.TEST_ENV || null;
    const bufferHex = Buffer.from("ok").toString("hex");
    return new Response(
      JSON.stringify({ envValue, bufferHex }),
      { headers: { "content-type": "application/json" } },
    );
  },
};
`;

export default {
  async fetch(request, env) {
    const worker = await env.USER_LOADER.get("test-worker", async () => {
      return {
        mainModule: "worker.js",
        modules: {
          "worker.js": workerCode,
        },
        compatibilityDate: "2026-01-01",
        compatibilityFlags: [
          "nodejs_compat",
          "nodejs_compat_populate_process_env",
        ],
        env: {
          TEST_ENV: "ok",
        },
      };
    });

    const fetcher = worker.getEntrypoint();
    return fetcher.fetch(request);
  },
};
