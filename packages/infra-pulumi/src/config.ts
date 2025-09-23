import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config("origan");

export const environment = config.get("environment") || "dev";
export const postgresPassword = config.requireSecret("postgresPassword");
export const garageEndpoint = config.get("garageEndpoint") || "https://s3.platform.origan.dev";
export const garageAccessKey = config.getSecret("garageAccessKey");
export const garageSecretKey = config.getSecret("garageSecretKey");
export const domainName = config.get("domainName") || "origan.dev";
export const registryEndpoint = config.get("registryEndpoint") || "registry.origan.dev";
export const kubeconfig = config.get("kubeconfig") || "~/.kube/config";

// Derived configurations
export const namespace = `origan-${environment}`;
export const labels = {
  app: "origan",
  environment: environment,
  managedBy: "pulumi",
};

// Service URLs
export const adminUrl = `admin.${domainName}`;
export const apiUrl = `api.${domainName}`;
export const landingUrl = domainName;
export const gatewayUrl = `*.${domainName}`;

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

// Image tags
export const imageTag = process.env.IMAGE_TAG || `${Date.now()}`;
export const builderImageTag = `builder-${imageTag}`;