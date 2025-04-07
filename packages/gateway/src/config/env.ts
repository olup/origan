export const ORIGAN_DOMAIN = process.env.ORIGAN_DOMAIN || "undefined";
export const RUNNER_URL = process.env.RUNNER_URL || "undefined";
export const BUCKET_NAME = process.env.BUCKET_NAME || "deployment-bucket";
export const BUCKET_URL = process.env.BUCKET_URL || "undefined";
export const BUCKET_REGION = process.env.BUCKET_REGION || "us-east-1";
export const BUCKET_ACCESS_KEY = process.env.BUCKET_ACCESS_KEY || "undefined";
export const BUCKET_SECRET_KEY = process.env.BUCKET_SECRET_KEY || "undefined";
export const PORT = process.env.PORT || 7777;

if (!ORIGAN_DOMAIN) {
  throw new Error("ORIGAN_DOMAIN environment variable is required");
}
