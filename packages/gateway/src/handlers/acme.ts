import type { IncomingMessage, ServerResponse } from "node:http";
import type { S3Client } from "@aws-sdk/client-s3";
import { getChallenge } from "../services/challenges.js";

const ACME_CHALLENGE_PREFIX = "/.well-known/acme-challenge/";

export const handleAcmeChallenge =
  (s3Client: S3Client, bucketName: string) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    // Only handle ACME challenge requests
    if (!req.url?.startsWith(ACME_CHALLENGE_PREFIX)) {
      return false;
    }

    // Extract token from URL
    const token = req.url.slice(ACME_CHALLENGE_PREFIX.length);
    if (!token) {
      res.writeHead(404);
      res.end("Not found");
      return true;
    }

    // Get challenge from storage
    const challenge = await getChallenge(s3Client, bucketName, token);
    if (!challenge) {
      console.log(`ACME challenge not found for token: ${token}`);
      res.writeHead(404);
      res.end("Not found");
      return true;
    }

    // Return key authorization as plain text (required by Let's Encrypt)
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(challenge.keyAuthorization);
    return true;
  };
