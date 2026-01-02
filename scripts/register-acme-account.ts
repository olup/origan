#!/usr/bin/env tsx

/**
 * Register an ACME account with Let's Encrypt
 * This script should be run once to register the account key
 */

import { readFileSync } from "node:fs";
import * as acme from "acme-client";

const ACME_SERVER_URL =
  process.env.ACME_SERVER_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";
const ACME_ACCOUNT_KEY_PATH = process.env.ACME_ACCOUNT_KEY_PATH;

async function registerAccount() {
  if (!ACME_ACCOUNT_KEY_PATH) {
    console.error("ACME_ACCOUNT_KEY_PATH environment variable is required");
    console.error(
      "Usage: ACME_ACCOUNT_KEY_PATH=/path/to/account-key.pem tsx scripts/register-acme-account.ts",
    );
    process.exit(1);
  }

  console.log(`Reading account key from: ${ACME_ACCOUNT_KEY_PATH}`);
  const accountKey = readFileSync(ACME_ACCOUNT_KEY_PATH, "utf-8");

  console.log(`Registering account with: ${ACME_SERVER_URL}`);

  const client = new acme.Client({
    directoryUrl: ACME_SERVER_URL,
    accountKey,
  });

  try {
    const account = await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ["mailto:your-email@example.com"], // Update this email
    });

    console.log("✅ Account registered successfully!");
    console.log("Account URL:", account.url);
    console.log("\nYou can now use this account key for certificate issuance.");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("account already exists")) {
      console.log("✅ Account already registered!");
    } else {
      console.error("❌ Failed to register account:");
      console.error(message);
      process.exit(1);
    }
  }
}

registerAccount();
