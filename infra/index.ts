import alchemy from "alchemy";
import { deployAdminPanel } from "./src/deployments/admin-panel.js";
import { deployBuilder } from "./src/deployments/builder.js";
import { deployControlApi } from "./src/deployments/control-api.js";
import { deployGateway } from "./src/deployments/gateway.js";
import { deployLandingPage } from "./src/deployments/landing-page.js";
import { deployRunner } from "./src/deployments/runner.js";
import { GarageBucket } from "./src/resources/garage/bucket.js";
import { Namespace } from "./src/resources/k3s/namespace.js";
import { NatsDeployment } from "./src/resources/nats/deployment.js";
import { PostgresDatabase } from "./src/resources/postgres/database.js";

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
  });

  // Deploy Frontend Applications
  const adminPanel = await deployAdminPanel();
  const landingPage = await deployLandingPage();

  // Deploy Backend Services
  const controlApi = await deployControlApi({
    namespace: origanNamespace.name,
    databaseEndpoint: origanDb.endpoint,
    natsEndpoint: nats.endpoint,
    bucketName: deploymentBucket.name,
  });

  // Deploy Gateway (reverse proxy for user deployments)
  const gateway = await deployGateway({
    namespace: origanNamespace.name,
    bucketName: deploymentBucket.name,
    bucketEndpoint: deploymentBucket.endpoint,
    bucketAccessKey: deploymentBucket.accessKeyId,
    bucketSecretKey: deploymentBucket.secretAccessKey,
  });

  // Deploy Runner (edge runtime for executing user functions)
  const runner = await deployRunner({
    namespace: origanNamespace.name,
    bucketName: deploymentBucket.name,
    bucketEndpoint: deploymentBucket.endpoint,
    bucketAccessKey: deploymentBucket.accessKeyId,
    bucketSecretKey: deploymentBucket.secretAccessKey,
    natsEndpoint: nats.endpoint,
  });

  // Deploy Builder (builds user projects - image only, runs as K8s Jobs)
  const builder = await deployBuilder({
    namespace: origanNamespace.name,
  });

  await app.finalize();

  console.log("✅ Origan infrastructure deployed successfully!");
  console.log("\n📊 Resources:");
  console.log(`- Namespace: ${origanNamespace.name}`);
  console.log(`- PostgreSQL: ${origanDb.endpoint}`);
  console.log(`- NATS: ${nats.endpoint}`);
  console.log(
    `- S3 Bucket: ${deploymentBucket.name} (${deploymentBucket.endpoint})`,
  );
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
