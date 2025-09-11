import alchemy from "alchemy";
import { deployAdmin } from "./deployments/admin.js";
import { deployBuilder } from "./deployments/builder.js";
import { deployControlApi } from "./deployments/control-api.js";
import { deployGateway } from "./deployments/gateway.js";
import { deployLandingPage } from "./deployments/landing-page.js";
import { deployRunner } from "./deployments/runner.js";
import { GarageBucket } from "./resources/garage/bucket.js";
import { Namespace } from "./resources/k3s/namespace.js";
import { NatsDeployment } from "./resources/nats/deployment.js";
import { PostgresDatabase } from "./resources/postgres/database.js";

async function main() {
  const app = await alchemy("origan-infrastructure", {
    password: process.env.ALCHEMY_PASSWORD || "default-dev-password",
  });

  // Create namespace for Origan
  const origanNamespace = await Namespace("origan", {
    labels: {
      app: "origan",
      managed_by: "alchemy",
    },
  });

  // Deploy PostgreSQL for Origan
  const origanDb = await PostgresDatabase("origan-db", {
    namespace: origanNamespace.name,
    database: "origan",
    user: "origan_root",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    storageSize: "5Gi",
    version: "16",
  });

  // Deploy NATS for Origan
  const nats = await NatsDeployment("origan-nats", {
    namespace: origanNamespace.name,
    jetstream: true,
    persistentStorage: true,
    storageSize: "1Gi",
    version: "2.10",
  });

  // Create Garage bucket for deployments
  const deploymentBucket = await GarageBucket("origan-deployment-bucket", {
    endpoint: process.env.GARAGE_ENDPOINT || "https://s3.platform.origan.dev",
    keyName: "origan-deployment",
    forceUpdate: "v2", // Change this value to force resource update
  });

  // Deploy Frontend Applications
  const adminPanel = await deployAdmin();
  const landingPage = await deployLandingPage();

  // Generate shared deployment tag for coordinated image updates
  const deploymentTag = Date.now().toString();

  // Deploy Builder first with the shared tag (builds user projects - image only, runs as K8s Jobs)
  const builder = await deployBuilder(deploymentTag);

  // Deploy Backend Services with coordinated builder image tag
  const controlApi = await deployControlApi({
    namespace: origanNamespace.name,
    databaseEndpoint: origanDb.endpoint,
    natsEndpoint: nats.endpoint,
    bucketName: deploymentBucket.name,
    bucketEndpoint: deploymentBucket.internalEndpoint, // Use internal endpoint
    bucketAccessKey: deploymentBucket.accessKeyId,
    bucketSecretKey: deploymentBucket.secretAccessKey,
    builderImageTag: deploymentTag, // Use same tag as builder for coordination
  });

  // Deploy Gateway (reverse proxy for user deployments)
  const gateway = await deployGateway({
    namespace: origanNamespace.name,
    bucketName: deploymentBucket.name,
    bucketEndpoint: deploymentBucket.internalEndpoint, // Use internal endpoint
    bucketAccessKey: deploymentBucket.accessKeyId,
    bucketSecretKey: deploymentBucket.secretAccessKey,
  });

  // Deploy Runner (edge runtime for executing user functions)
  const runner = await deployRunner({
    namespace: origanNamespace.name,
    bucketName: deploymentBucket.name,
    bucketEndpoint: deploymentBucket.internalEndpoint, // Use internal endpoint
    bucketAccessKey: deploymentBucket.accessKeyId,
    bucketSecretKey: deploymentBucket.secretAccessKey,
    natsEndpoint: nats.endpoint,
  });

  await app.finalize();

  console.log("✅ Origan infrastructure deployed successfully!");
  console.log("\n📊 Resources:");
  console.log(`- Namespace: ${origanNamespace.name}`);
  console.log(`- PostgreSQL: ${origanDb.endpoint}`);
  console.log(`- NATS: ${nats.endpoint}`);
  console.log(
    `- S3 Bucket: ${deploymentBucket.name}`,
  );
  console.log(`  - External: ${deploymentBucket.endpoint}`);
  console.log(`  - Internal: ${deploymentBucket.internalEndpoint}`);
  console.log(
    `- Admin Panel: ${adminPanel.bucket.name} (${adminPanel.deployment.filesUploaded} files)`,
  );
  console.log(`  - URL: ${adminPanel.ingress.url}`);
  console.log(
    `- Landing Page: ${landingPage.bucket.name} (${landingPage.deployment.filesUploaded} files)`,
  );
  console.log(`  - URL: ${landingPage.ingress.url}`);
  console.log(`- Control API: ${controlApi.deployment.name}`);
  console.log(`  - URL: ${controlApi.ingress.url}`);
  console.log(`- Gateway: ${gateway.deployment.name}`);
  console.log(`  - Wildcard domain: ${gateway.ingress.url}`);
  console.log(`- Runner: ${runner.deployment.name}`);
  console.log(
    `  - Service: http://runner.${origanNamespace.name}.svc.cluster.local:9000`,
  );
  console.log(`- Builder Image: ${builder.image.fullImageUrl}`);
  console.log("  - Used by Control API for build jobs");
}

main().catch(console.error);
