import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

const config = new pulumi.Config("origan");

export const environment = config.get("environment") || "dev";

// Generate a random password for PostgreSQL if not provided
const postgresPasswordConfig = config.getSecret("postgresPassword");
export const postgresPasswordResource = postgresPasswordConfig
  ? null
  : new random.RandomPassword("postgres-password", {
      length: 32,
      special: true,
    });

export const postgresPassword =
  postgresPasswordConfig || postgresPasswordResource!.result;
export const garageEndpoint =
  config.get("garageEndpoint") || "https://s3.platform.origan.dev";

// Generate Garage credentials if not provided
const garageAccessKeyConfig = config.getSecret("garageAccessKey");
export const garageAccessKeyResource = garageAccessKeyConfig
  ? null
  : new random.RandomString("garage-access-key", {
      length: 20,
      special: false,
      upper: true,
      lower: true,
      numeric: true,
    });

const garageSecretKeyConfig = config.getSecret("garageSecretKey");
export const garageSecretKeyResource = garageSecretKeyConfig
  ? null
  : new random.RandomPassword("garage-secret-key", {
      length: 40,
      special: false,
    });

export const garageAccessKey =
  garageAccessKeyConfig || garageAccessKeyResource?.result;
export const garageSecretKey =
  garageSecretKeyConfig || garageSecretKeyResource?.result;
export const domainName = config.get("domainName") || "origan.dev";
export const registryEndpoint =
  config.get("registryEndpoint") || "registry.platform.origan.dev";
export const kubeconfig = config.get("kubeconfig") || "~/.kube/config";

// Namespace configuration - use different namespace for testing
// For testing alongside existing deployment, use "origan-pulumi" or "origan-test"
export const namespacePrefix = config.get("namespacePrefix") || "origan-pulumi";
export const namespace = `${namespacePrefix}-${environment}`;

export const labels = {
  app: "origan",
  environment: environment,
  managedBy: "pulumi",
  deployment: namespacePrefix,
};

// Service URLs
export const adminUrl = `admin.${domainName}`;
export const apiUrl = `api.${domainName}`;
export const landingUrl = `hello.${domainName}`;
export const gatewayUrl = "*.origan.app"; // User deployments on .app domain

// Resource naming helper
export const resourceName = (name: string) => `${name}-${environment}`;

// Database configuration
export const dbConfig = {
  name: "origan",
  user: "origan_root",
  password: postgresPassword,
  version: "16",
  storageSize: "5Gi",
};

// NATS configuration
export const natsConfig = {
  version: "2.10",
  jetstream: true,
  persistentStorage: true,
  storageSize: "1Gi",
};

// Image tags - use environment-based stable tags
// Pulumi's docker.Image will automatically detect code changes via content hash
export const imageTag = process.env.IMAGE_TAG || environment;
export const builderImageTag = `builder-${environment}`;
