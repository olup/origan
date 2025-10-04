import * as acme from "acme-client";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { domainSchema } from "../libs/db/schema.js";
import { s3Client } from "../libs/s3.js";
import {
  deleteCertificate as deleteS3Certificate,
  storeCertificate,
} from "../utils/s3-certificates.js";
import { storeChallenge } from "../utils/s3-challenges.js";

const log = getLogger();

/**
 * Get or create ACME client instance
 */
function getAcmeClient(): acme.Client {
  if (!env.ACME_ACCOUNT_KEY) {
    throw new Error("ACME_ACCOUNT_KEY not configured");
  }

  // Parse the account key (PEM format)
  const accountKey = Buffer.from(env.ACME_ACCOUNT_KEY, "base64").toString(
    "utf-8",
  );

  // Create ACME client for Let's Encrypt production
  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  return client;
}

/**
 * Issue a certificate for a domain using ACME HTTP-01 challenge
 */
export async function issueCertificate(domainName: string): Promise<void> {
  log.info(`Starting certificate issuance for domain: ${domainName}`);

  try {
    // Update domain status to pending
    await db
      .update(domainSchema)
      .set({
        certificateStatus: "pending",
        lastCertificateError: null,
      })
      .where(eq(domainSchema.name, domainName));

    const client = getAcmeClient();

    // Create a Certificate Signing Request (CSR)
    const [privateKey, csr] = await acme.crypto.createCsr({
      commonName: domainName,
    });

    log.info(`CSR created for ${domainName}`);

    // Create order
    const order = await client.createOrder({
      identifiers: [{ type: "dns", value: domainName }],
    });

    log.info(`Order created for ${domainName}`);

    // Get authorizations and process challenges
    const authorizations = await client.getAuthorizations(order);

    for (const auth of authorizations) {
      // Find HTTP-01 challenge
      const challenge = auth.challenges.find((c) => c.type === "http-01");
      if (!challenge) {
        throw new Error("No HTTP-01 challenge found");
      }

      // Get key authorization
      const keyAuthorization =
        await client.getChallengeKeyAuthorization(challenge);

      log.info(`Storing challenge for ${domainName}: token=${challenge.token}`);

      // Store challenge in S3 for gateway to serve
      await storeChallenge(s3Client, env.BUCKET_NAME, {
        token: challenge.token,
        keyAuthorization,
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiry
      });

      // Notify ACME server that challenge is ready
      log.info(`Verifying challenge for ${domainName}`);
      await client.verifyChallenge(auth, challenge);

      // Wait for challenge to be validated
      log.info(`Completing challenge for ${domainName}`);
      await client.completeChallenge(challenge);
      await client.waitForValidStatus(challenge);

      log.info(`Challenge validated for ${domainName}`);
    }

    // Finalize order
    log.info(`Finalizing order for ${domainName}`);
    await client.finalizeOrder(order, csr);

    // Get certificate
    const cert = await client.getCertificate(order);

    log.info(`Certificate issued for ${domainName}`);

    // Parse certificate chain
    const certParts = cert.split(/(?=-----BEGIN CERTIFICATE-----)/);
    const certificate = certParts[0];
    const chain = certParts.slice(1).join("");

    // Store certificate in S3
    await storeCertificate(s3Client, env.BUCKET_NAME, domainName, {
      privateKey: privateKey.toString(),
      certificate,
      chain,
    });

    log.info(`Certificate stored in S3 for ${domainName}`);

    // Parse certificate to get expiry date
    const certInfo = await acme.crypto.readCertificateInfo(certificate);
    const expiresAt = certInfo.notAfter;

    // Update domain status
    await db
      .update(domainSchema)
      .set({
        certificateStatus: "valid",
        certificateIssuedAt: new Date(),
        certificateExpiresAt: expiresAt,
        lastCertificateError: null,
      })
      .where(eq(domainSchema.name, domainName));

    log.info(
      `Certificate issuance complete for ${domainName}, expires: ${expiresAt}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log
      .withError(error)
      .error(`Failed to issue certificate for ${domainName}: ${errorMessage}`);

    // Update domain with error status
    await db
      .update(domainSchema)
      .set({
        certificateStatus: "error",
        lastCertificateError: errorMessage,
      })
      .where(eq(domainSchema.name, domainName));

    throw error;
  }
}

/**
 * Delete certificate for a domain
 */
export async function deleteCertificate(domainName: string): Promise<void> {
  log.info(`Deleting certificate for domain: ${domainName}`);

  try {
    await deleteS3Certificate(s3Client, env.BUCKET_NAME, domainName);
    log.info(`Certificate deleted from S3 for ${domainName}`);
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to delete certificate for ${domainName}`);
    throw error;
  }
}
