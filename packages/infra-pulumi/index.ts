import * as pulumi from "@pulumi/pulumi";

// Import core infrastructure
import { namespaceName_ } from "./src/core/namespace.js";
import { postgresEndpoint, postgresConnectionString } from "./src/core/database.js";
import { natsEndpoint, natsMonitorEndpoint } from "./src/core/nats.js";
import { 
  deploymentBucketName, 
  adminBucketName, 
  landingBucketName,
  externalGarageEndpoint,
  internalGarageEndpoint,
} from "./src/core/storage.js";

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
  builderImageUrl,
  builderImage,
} from "./src/services/builder.js";

// Import static sites
import { 
  adminPanelUrl, 
  adminFilesUploaded,
  adminBucket,
} from "./src/static/admin.js";

// Stack outputs
export const infrastructure = {
  // Namespace
  namespace: namespaceName_,
  
  // Core services
  database: {
    endpoint: postgresEndpoint,
    connectionString: postgresConnectionString,
  },
  
  nats: {
    endpoint: natsEndpoint,
    monitorEndpoint: natsMonitorEndpoint,
  },
  
  storage: {
    deploymentBucket: deploymentBucketName,
    adminBucket: adminBucketName,
    landingBucket: landingBucketName,
    externalEndpoint: externalGarageEndpoint,
    internalEndpoint: internalGarageEndpoint,
  },
  
  // Application services
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
  },
  
  // Static sites
  staticSites: {
    admin: {
      url: adminPanelUrl,
      filesUploaded: adminFilesUploaded,
      bucket: adminBucket,
    },
    // Add landing page when implemented
  },
};

// Print summary on successful deployment
pulumi.all([
  namespaceName_,
  controlApiUrl,
  adminPanelUrl,
  gatewayWildcardDomain,
]).apply(([namespace, apiUrl, adminUrl, gatewayDomain]) => {
  console.log("\n✅ Origan Infrastructure Deployed Successfully!");
  console.log("\n📊 Resource Summary:");
  console.log(`- Namespace: ${namespace}`);
  console.log(`- Control API: ${apiUrl}`);
  console.log(`- Admin Panel: ${adminUrl}`);
  console.log(`- Gateway (User Apps): ${gatewayDomain}`);
  console.log("\n🚀 Next Steps:");
  console.log("1. Configure DNS records for your domains");
  console.log("2. Set up GitHub App credentials");
  console.log("3. Initialize the database schema");
  console.log("4. Access the admin panel to start deploying!");
});