import { trpc } from "../libs/trpc-client.js";
import type { Config } from "../types/config.js";

type CachedConfig = { config: Config; deploymentId: string; projectId: string };

export async function getConfig(domain: string): Promise<CachedConfig | null> {
  console.log(`Fetching config for domain: ${domain}`);
  try {
    const data = await trpc.deployments.getConfigByDomain.query({ domain });
    return data as CachedConfig;
  } catch (error) {
    console.error(`Error fetching config for ${domain}:`, error);
    return null;
  }
}
