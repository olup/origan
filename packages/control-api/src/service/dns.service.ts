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

    // In development mode, skip CNAME validation
    // This allows testing with localtest.me when control-api runs locally
    if (env.APP_ENV === "development") {
      log.info(`Skipping CNAME validation in development mode for: ${domain}`);
      return true;
    }

    // For production, validate CNAME record
    const targetDomain = env.ORIGAN_DEPLOY_DOMAIN;

    try {
      const cnameRecords = await dns.resolveCname(domain);
      log.info(`CNAME records for ${domain}:`, cnameRecords.join(", "));

      // Check if any CNAME points to *.origan.app (or DOMAIN_SUFFIX)
      const pointsToGateway = cnameRecords.some((cname) =>
        cname.toLowerCase().endsWith(`.${targetDomain}`),
      );

      if (pointsToGateway) {
        log.info(
          `Domain ${domain} correctly points to *.${targetDomain} via CNAME`,
        );
        return true;
      }

      log.warn(
        `Domain ${domain} has CNAME records but none point to *.${targetDomain}`,
      );
      return false;
    } catch {
      // No CNAME record found
      log.warn(`No CNAME found for ${domain} pointing to *.${targetDomain}`);
      return false;
    }
  } catch (error) {
    log.error(`DNS validation failed for ${domain}:`, error as string);
    return false;
  }
}
