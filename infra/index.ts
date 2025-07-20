import * as pulumi from "@pulumi/pulumi";
import type { GlobalResourcesOutput } from "./src/components/global";
import { deployToK3s, deployToScaleway } from "./src/index";

interface StackOutput extends GlobalResourcesOutput {
  apiUrl: pulumi.Output<string>;
  adminPanelUrl: pulumi.Output<string>;
  bucketUrl: pulumi.Output<string>;
  bucketName: pulumi.Output<string>;
  bucketRegion: pulumi.Output<string>;
  bucketAccessKey: pulumi.Output<string>;
  bucketSecretKey: pulumi.Output<string>;
  database: {
    connectionString: pulumi.Output<string>;
  };
}

const stackName = pulumi.getStack();
let outputs: StackOutput;
if (stackName === "prod") {
  outputs = deployToScaleway();
} else if (stackName === "prod-k3s") {
  outputs = deployToK3s();
} else {
  throw new Error("Unknown stack");
}

// Export outputs to Pulumi stack
export const apiUrl = outputs.apiUrl;
export const adminPanelUrl = outputs.adminPanelUrl;
export const bucketUrl = outputs.bucketUrl;
export const bucketName = outputs.bucketName;
export const bucketRegion = outputs.bucketRegion;
export const bucketAccessKey = outputs.bucketAccessKey;
export const bucketSecretKey = outputs.bucketSecretKey;
export const databaseConnectionString = outputs.database.connectionString;
export const natsInfo = outputs.nats;
