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
  logsBucketName,
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

// Import services
import { 
  controlApiUrl, 
  controlApiServiceName, 
  controlApiImage,
} from "./src/services/control-api.js";
import {
  gatewayServiceName,
  gatewayWildcardDomain,
  gatewayImage,
} from "./src/services/gateway.js";
import {
  builderImage,
  builderImageUrl,
} from "./src/services/builder.js";
import {
  runnerServiceName,
  runnerEndpoint,
  runnerImage,
} from "./src/services/runner.js";

// Import static sites
import { 
  adminPanelUrl, 
} from "./src/static/admin.js";
import { 
  landingPageUrl, 
} from "./src/static/landing.js";
import {
  adminServiceName,
  adminContentHash,
} from "./src/static/admin-deployment.js";
import {
  landingServiceName,
  landingContentHash,
} from "./src/static/landing-deployment.js";

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
      imageDigest: controlApiImage.repoDigest,
      imageTags: controlApiImage.allTags,
    },
    gateway: {
      serviceName: gatewayServiceName,
      wildcardDomain: gatewayWildcardDomain,
      imageDigest: gatewayImage.repoDigest,
      imageTags: gatewayImage.allTags,
    },
    builder: {
      imageDigest: builderImageUrl,
      imageTags: builderImage.allTags,
    },
    runner: {
      service: runnerServiceName,
      endpoint: runnerEndpoint,
      imageDigest: runnerImage.repoDigest,
      imageTags: runnerImage.allTags,
    },
  },
  
  // Static sites
  staticSites: {
    admin: {
      url: adminPanelUrl,
      service: adminServiceName,
      contentHash: pulumi.output(adminContentHash),
    },
    landing: {
      url: landingPageUrl,
      service: landingServiceName,
      contentHash: pulumi.output(landingContentHash),
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
  console.log("- Garage S3: ✅ Deployed with 2 buckets");
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
