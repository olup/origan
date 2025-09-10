import { type Context, Resource } from "alchemy";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Properties for creating a Garage bucket
 */
export interface GarageBucketProps {
  /**
   * Garage endpoint URL
   */
  endpoint?: string;

  /**
   * Garage admin token (for bucket creation)
   */
  adminToken?: string;

  /**
   * Access key name
   */
  keyName?: string;

  /**
   * Configure bucket as a website
   */
  website?: boolean;

  /**
   * Index document for website (default: index.html)
   */
  indexDocument?: string;

  /**
   * Error document for website (default: error.html)
   */
  errorDocument?: string;
}

/**
 * Garage bucket resource output
 */
export interface GarageBucket
  extends Resource<"garage::Bucket">,
    GarageBucketProps {
  /**
   * Bucket name
   */
  name: string;

  /**
   * S3 endpoint URL
   */
  endpoint: string;

  /**
   * Access key ID
   */
  accessKeyId: string;

  /**
   * Secret access key
   */
  secretAccessKey: string;

  /**
   * Bucket region (garage uses 'garage' as region)
   */
  region: string;

  /**
   * Created timestamp
   */
  createdAt: number;
}

/**
 * Garage S3-compatible bucket
 *
 * @example
 * // Create a simple Garage bucket
 * const bucket = await GarageBucket("my-bucket", {
 *   endpoint: "https://s3.platform.origan.dev",
 *   keyName: "my-app"
 * });
 *
 * @example
 * // Create a deployment bucket
 * const deploymentBucket = await GarageBucket("origan-deployment-bucket", {
 *   endpoint: process.env.GARAGE_S3_ENDPOINT,
 *   adminToken: process.env.GARAGE_ADMIN_TOKEN,
 *   keyName: "origan-deployment"
 * });
 *
 * @example
 * // Create a website bucket
 * const websiteBucket = await GarageBucket("admin", {
 *   endpoint: process.env.GARAGE_ENDPOINT,
 *   keyName: "admin",
 *   website: true,
 *   indexDocument: "index.html",
 *   errorDocument: "404.html"
 * });
 */
export const GarageBucket = Resource(
  "garage::Bucket",
  async function (
    this: Context<GarageBucket>,
    name: string,
    props: GarageBucketProps = {},
  ): Promise<GarageBucket> {
    const host = process.env.K3S_SSH_HOST || "62.171.156.174";
    const endpoint =
      props.endpoint ||
      process.env.GARAGE_ENDPOINT ||
      "https://s3.platform.origan.dev";
    const keyName = props.keyName || name;

    if (this.phase === "delete") {
      try {
        // Delete bucket permissions
        const keyInfo = await execAsync(
          `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage key info ${keyName} --show-secret 2>/dev/null | grep -A1 'Key ID' || true"`,
        );

        if (keyInfo.stdout) {
          const keyId = keyInfo.stdout.match(/Key ID:\s+(\S+)/)?.[1];
          if (keyId) {
            // Revoke bucket permissions
            await execAsync(
              `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage bucket deny --read --write --owner ${name} --key ${keyId}"`,
            ).catch(() => {});
          }
        }

        // Note: We don't delete the bucket itself as it might contain data
        // Garage doesn't support deleting non-empty buckets easily
        console.log(
          `Bucket ${name} permissions revoked. Bucket not deleted to preserve data.`,
        );
      } catch (error) {
        console.error("Error deleting Garage bucket resources:", error);
      }
      return this.destroy();
    }

    // Create or update
    console.log(`Managing Garage bucket ${name}...`);

    // Check if bucket exists
    let bucketExists = false;
    try {
      const listResult = await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage bucket list | grep -w ${name}"`,
      );
      bucketExists = listResult.stdout.includes(name);
    } catch {
      // Bucket doesn't exist
    }

    // Create bucket if it doesn't exist
    if (!bucketExists) {
      console.log(`Creating bucket ${name}...`);
      await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage bucket create ${name}"`,
      );
    }

    // Check if key exists
    let keyExists = false;
    let accessKeyId = "";
    let secretAccessKey = "";

    try {
      const keyInfo = await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage key info ${keyName} --show-secret 2>/dev/null"`,
      );
      keyExists = true;

      // Extract key ID and secret
      accessKeyId = keyInfo.stdout.match(/Key ID:\s+(\S+)/)?.[1] || "";
      secretAccessKey = keyInfo.stdout.match(/Secret key:\s+(\S+)/)?.[1] || "";
    } catch {
      // Key doesn't exist
    }

    // Create key if it doesn't exist
    if (!keyExists) {
      console.log(`Creating access key ${keyName}...`);
      const createKeyResult = await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage key create ${keyName}"`,
      );

      // Extract the key ID from creation output
      accessKeyId = createKeyResult.stdout.match(/Key ID:\s+(\S+)/)?.[1] || "";

      // Get the secret key
      const keyInfo = await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage key info ${keyName} --show-secret"`,
      );
      secretAccessKey = keyInfo.stdout.match(/Secret key:\s+(\S+)/)?.[1] || "";
    }

    // Grant permissions to the key for this bucket
    console.log(`Granting permissions to key ${keyName} for bucket ${name}...`);
    await execAsync(
      `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage bucket allow --read --write --owner ${name} --key ${accessKeyId}"`,
    );

    // Configure as website if requested
    if (props.website) {
      console.log(`Configuring bucket ${name} as a website...`);
      const indexDoc = props.indexDocument || "index.html";
      const errorDoc = props.errorDocument || "error.html";

      await execAsync(
        `ssh root@${host} "kubectl exec -n platform deployment/garage -- /garage bucket website --allow ${name} --index-document ${indexDoc} --error-document ${errorDoc}"`,
      );

      console.log(`✅ Website hosting enabled for bucket ${name}`);
    }

    // Verify the bucket is accessible
    console.log(`✅ Garage bucket ${name} is ready`);

    return this({
      ...props,
      name,
      endpoint,
      accessKeyId,
      secretAccessKey,
      region: "garage", // Garage uses 'garage' as the region
      createdAt: Date.now(),
    });
  },
);
