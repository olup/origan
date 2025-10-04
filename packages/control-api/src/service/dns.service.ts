import { promises as dns } from "node:dns";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";

const log = getLogger();

/**
 * Validates that a domain points to our gateway via CNAME record.
 * Returns true if the domain is correctly configured, false otherwise.
 */
export async function validateDnsPointsToGateway(
  domain: string,
): Promise<boolean> {
  try {
    log.info(`Validating DNS for custom domain: ${domain}`);

    // Try to resolve CNAME record
    try {
      const cnameRecords = await dns.resolveCname(domain);
      log.info(`CNAME records for ${domain}:`, cnameRecords.join(", "));

      // Check if any CNAME points to *.origan.app
      const pointsToOrigan = cnameRecords.some((cname) =>
        cname.toLowerCase().endsWith(`.${env.ORIGAN_DEPLOY_DOMAIN}`),
      );

      if (pointsToOrigan) {
        log.info(
          `Domain ${domain} correctly points to *.${env.ORIGAN_DEPLOY_DOMAIN} via CNAME`,
        );
        return true;
      }

      log.warn(
        `Domain ${domain} has CNAME records but none point to *.${env.ORIGAN_DEPLOY_DOMAIN}`,
      );
      return false;
    } catch {
      // No CNAME record found
      log.warn(
        `No CNAME found for ${domain} pointing to *.${env.ORIGAN_DEPLOY_DOMAIN}`,
      );
      return false;
    }
  } catch (error) {
    log.error(`DNS validation failed for ${domain}:`, error as string);
    return false;
  }
}

/**
 * Get instructions for configuring DNS based on validation result.
 */
export function getDnsInstructions(domain: string): string {
  return `Please configure a CNAME record for '${domain}' pointing to any *.${env.ORIGAN_DEPLOY_DOMAIN} subdomain (e.g., gateway.${env.ORIGAN_DEPLOY_DOMAIN})`;
}
