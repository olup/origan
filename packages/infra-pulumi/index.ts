import * as pulumi from "@pulumi/pulumi";

// Import core infrastructure
import { namespaceName_ } from "./src/core/namespace.js";
import { postgresEndpoint, postgresConnectionString } from "./src/core/database.js";
import { natsEndpoint, natsMonitorEndpoint } from "./src/core/nats.js";
import { 
  registryServiceName,
  registryEndpointInternal,
  registryEndpointExternal,
} from "./src/core/registry.js";
import { 
  garageServiceName,
  garageEndpointInternal,
  garageEndpointExternal,
  deploymentBucketName, 
  adminBucketName, 
  landingBucketName,
  logsBucketName,
  adminSync,
  landingSync,
} from "./src/core/garage.js";
import { 
  parseableServiceName,
  parseableUrl,
  parseableUsername,
  parseablePasswordValue,
} from "./src/core/parseable.js";
import { 
  fluentbitDaemonSetName,
} from "./src/core/logging.js";

// Import services - TEMPORARILY COMMENTED OUT
// import { 
//   controlApiUrl, 
//   controlApiServiceName, 
//   controlApiImage,
// } from "./src/services/control-api.js";
// import { 
//   gatewayServiceName, 
//   gatewayWildcardDomain,
//   gatewayImage,
// } from "./src/services/gateway.js";
// import { 
//   builderImageUrl,
// } from "./src/services/builder.js";
// import { 
//   runnerServiceName,
//   runnerEndpoint,
//   runnerImage,
// } from "./src/services/runner.js";

// Temporary placeholders for commented services
const controlApiUrl = pulumi.output("api.origan.dev");
const controlApiServiceName = pulumi.output("control-api-prod");
const controlApiImage = { imageName: pulumi.output("not-deployed") };
const gatewayServiceName = pulumi.output("gateway-prod");
const gatewayWildcardDomain = pulumi.output("*.origan.dev");
const gatewayImage = { imageName: pulumi.output("not-deployed") };
const builderImageUrl = pulumi.output("not-deployed");
const runnerServiceName = pulumi.output("runner-prod");
const runnerEndpoint = pulumi.output("not-deployed");
const runnerImage = { imageName: pulumi.output("not-deployed") };

// Import static sites
import { 
  adminPanelUrl, 
} from "./src/static/admin.js";
import { 
  landingPageUrl, 
} from "./src/static/landing.js";

// Stack outputs
export const infrastructure = {
  // Namespace
  namespace: namespaceName_,
  
  // Core services
  registry: {
    service: registryServiceName,
    internalEndpoint: registryEndpointInternal,
    externalUrl: registryEndpointExternal,
  },
  
  database: {
    endpoint: postgresEndpoint,
    connectionString: postgresConnectionString,
  },
  
  nats: {
    endpoint: natsEndpoint,
    monitorEndpoint: natsMonitorEndpoint,
  },
  
  storage: {
    service: garageServiceName,
    internalEndpoint: garageEndpointInternal,
    externalEndpoint: garageEndpointExternal,
    buckets: {
      deployments: deploymentBucketName,
      admin: adminBucketName,
      landing: landingBucketName,
      logs: logsBucketName,
    },
  },
  
  logging: {
    parseable: {
      service: parseableServiceName,
      url: parseableUrl,
      username: parseableUsername,
      password: parseablePasswordValue,
    },
    fluentbit: {
      daemonSet: fluentbitDaemonSetName,
    },
  },
  
  // Application services - TEMPORARILY DISABLED
  services: {
    controlApi: {
      url: controlApiUrl,
      serviceName: controlApiServiceName,
      image: controlApiImage.imageName,
    },
    gateway: {
      serviceName: gatewayServiceName,
      wildcardDomain: gatewayWildcardDomain,
      image: gatewayImage.imageName,
    },
    builder: {
      image: builderImageUrl,
    },
    runner: {
      service: runnerServiceName,
      endpoint: runnerEndpoint,
      image: runnerImage.imageName,
    },
  },
  
  // Static sites
  staticSites: {
    admin: {
      url: adminPanelUrl,
      filesUploaded: adminSync ? adminSync.fileCount : pulumi.output(0),
      bucket: adminBucketName,
      syncedAt: adminSync ? adminSync.syncedAt : pulumi.output("not synced"),
    },
    landing: {
      url: landingPageUrl,
      filesUploaded: landingSync ? landingSync.fileCount : pulumi.output(0),
      bucket: landingBucketName,
      syncedAt: landingSync ? landingSync.syncedAt : pulumi.output("not synced"),
    },
  },
};

// Print summary on successful deployment
pulumi.all([
  namespaceName_,
  // controlApiUrl,  // Commented out temporarily
  adminPanelUrl,
  landingPageUrl,
  // gatewayWildcardDomain,  // Commented out temporarily
  parseableUrl,
]).apply(([namespace, adminUrl, landingUrl, logsUrl]) => {
  console.log("\n✅ Origan Infrastructure Deployed Successfully!");
  console.log("\n📊 Resource Summary:");
  console.log(`- Namespace: ${namespace}`);
  // console.log(`- Control API: ${apiUrl}`);
  console.log(`- Admin Panel: ${adminUrl}`);
  console.log(`- Landing Page: ${landingUrl}`);
  // console.log(`- Gateway (User Apps): ${gatewayDomain}`);
  console.log(`- Logs UI: ${logsUrl}`);
  console.log("\n🔧 Core Infrastructure:");
  console.log("- Docker Registry: ⏸️  TEMPORARILY DISABLED");
  console.log("- PostgreSQL: ✅ Deployed with persistent storage");
  console.log("- NATS with JetStream: ✅ Deployed");
  console.log("- Garage S3: ✅ Deployed with 4 buckets");
  console.log("- Parseable: ✅ Deployed for log aggregation");
  console.log("- Fluent-bit: ✅ DaemonSet collecting logs");
  console.log("\n🚀 Next Steps:");
  console.log("1. Wait for all services to be ready");
  console.log("2. Access the admin panel to configure GitHub integration");
  console.log("3. Create your first deployment!");
  console.log("\n📝 Notes:");
  console.log("- Logs from pods with 'origan.dev/collect-logs: true' annotation are sent to Parseable");
  console.log("- All services use the 'origan-pulumi-prod' namespace");
  console.log("- Garage S3 is accessible at https://s3.origan.dev");
});