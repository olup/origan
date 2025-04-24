import { LRUCache } from "lru-cache";
import { client } from "../libs/client.js";
import type { Config } from "../types/config.js";

type CachedConfig = { config: Config; deploymentId: string; projectId: string };

// Cache config: max 1000 items, stale while revalidate
const configCache = new LRUCache<string, CachedConfig>({
  max: 1000,
  allowStale: true,
  fetchMethod: async (domain) => {
    console.log(`Fetching config for domain: ${domain}`);
    try {
      const response = await client.deployments["get-config"].$post({
        json: {
          domain,
        },
      });

      const data = await response.json();

      if ("error" in data) {
        console.error(`Error fetching config for ${domain}:`, data.error);
        return undefined; // Don't cache errors
      }

      return data;
    } catch (error) {
      console.error(`Error fetching config for ${domain}:`, error);
      return undefined; // Don't cache errors
    }
  },
});

export async function getConfig(domain: string): Promise<CachedConfig | null> {
  const cachedConfig = await configCache.fetch(domain);
  return cachedConfig ?? null;
}
