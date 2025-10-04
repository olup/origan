import { and, eq } from "drizzle-orm";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { domainSchema, projectSchema, trackSchema } from "../libs/db/schema.js";
import { deleteCertificate, issueCertificate } from "./certificate.service.js";
import {
  getDnsInstructions,
  validateDnsPointsToGateway,
} from "./dns.service.js";

const log = getLogger();

export interface AddCustomDomainInput {
  projectReference: string;
  trackName: string;
  domainName: string;
}

export interface AddCustomDomainResult {
  domain: typeof domainSchema.$inferSelect;
}

/**
 * Add a custom domain to a track
 * Throws an error if DNS validation fails
 */
export async function addCustomDomain(
  input: AddCustomDomainInput,
): Promise<AddCustomDomainResult> {
  const { projectReference, trackName, domainName } = input;

  log.info(
    `Adding custom domain ${domainName} to project ${projectReference}, track ${trackName}`,
  );

  // Get project
  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.reference, projectReference),
  });

  if (!project) {
    throw new Error(`Project not found: ${projectReference}`);
  }

  // Get track
  const track = await db.query.trackSchema.findFirst({
    where: and(
      eq(trackSchema.projectId, project.id),
      eq(trackSchema.name, trackName),
    ),
  });

  if (!track) {
    throw new Error(
      `Track '${trackName}' not found in project '${projectReference}'`,
    );
  }

  // Check if domain already exists
  const existingDomain = await db.query.domainSchema.findFirst({
    where: eq(domainSchema.name, domainName),
  });

  if (existingDomain) {
    throw new Error(`Domain already exists: ${domainName}`);
  }

  // Validate DNS configuration - throw if invalid
  const dnsValid = await validateDnsPointsToGateway(domainName);

  if (!dnsValid) {
    const instructions = getDnsInstructions(domainName);
    log.warn(`DNS validation failed for ${domainName}`);
    throw new Error(`DNS validation failed. ${instructions}`);
  }

  // DNS is valid, create domain and trigger certificate issuance
  log.info(`DNS validated for ${domainName}, creating domain record`);

  const [domain] = await db
    .insert(domainSchema)
    .values({
      name: domainName,
      projectId: track.projectId,
      trackId: track.id,
      isCustom: true,
      certificateStatus: "pending",
    })
    .returning();

  // Trigger certificate issuance asynchronously (don't wait for it)
  issueCertificate(domainName).catch((error) => {
    log.withError(error).error(`Failed to issue certificate for ${domainName}`);
  });

  return {
    domain,
  };
}

/**
 * Remove a custom domain
 */
export async function removeCustomDomain(domainName: string): Promise<void> {
  log.info(`Removing custom domain ${domainName}`);

  const domain = await db.query.domainSchema.findFirst({
    where: eq(domainSchema.name, domainName),
  });

  if (!domain) {
    throw new Error(`Domain not found: ${domainName}`);
  }

  if (!domain.isCustom) {
    throw new Error(`Domain is not a custom domain: ${domainName}`);
  }

  // Delete certificate from S3 if it exists
  if (domain.certificateStatus === "valid") {
    try {
      await deleteCertificate(domain.name);
    } catch (error) {
      log
        .withError(error)
        .error(`Failed to delete certificate for ${domain.name}`);
      // Continue with domain deletion even if cert deletion fails
    }
  }

  // Delete domain from database
  await db.delete(domainSchema).where(eq(domainSchema.name, domainName));

  log.info(`Custom domain removed: ${domainName}`);
}

/**
 * Get custom domains for a project
 */
export async function getCustomDomainsForProject(projectReference: string) {
  // Get project
  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.reference, projectReference),
  });

  if (!project) {
    throw new Error(`Project not found: ${projectReference}`);
  }

  return await db.query.domainSchema.findMany({
    where: and(
      eq(domainSchema.projectId, project.id),
      eq(domainSchema.isCustom, true),
    ),
    with: {
      track: true,
    },
  });
}

/**
 * Get domain status
 */
export async function getDomainStatus(domainName: string) {
  const domain = await db.query.domainSchema.findFirst({
    where: eq(domainSchema.name, domainName),
  });

  if (!domain) {
    throw new Error(`Domain not found: ${domainName}`);
  }

  return {
    name: domain.name,
    certificateStatus: domain.certificateStatus,
    certificateIssuedAt: domain.certificateIssuedAt,
    certificateExpiresAt: domain.certificateExpiresAt,
    lastCertificateError: domain.lastCertificateError,
  };
}
