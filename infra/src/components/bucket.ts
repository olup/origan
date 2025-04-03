import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gn } from "../utils";

export interface BucketConfig {
  bucketUrl: pulumi.Output<string>;
  bucketName: pulumi.Output<string>;
  bucketAccessKey: pulumi.Output<string>;
  bucketSecretKey: pulumi.Output<string>;
  bucketRegion: pulumi.Output<string>;
}

export interface DeployBucketOutputs {
  bucket: scaleway.object.Bucket;
  config: BucketConfig;
}

export function deployBucket(): DeployBucketOutputs {
  const _project = scaleway.account.getProject({
    name: "origan",
  });

  // Create a dedicated IAM application for bucket access
  const bucketApp = new scaleway.iam.Application(gn("bucket-app"), {
    name: "Bucket Access",
    description: "Application for bucket access",
  });

  // Create policy for bucket access
  const bucketAccessPolicy = new scaleway.iam.Policy(
    gn("bucket-access-policy"),
    {
      applicationId: bucketApp.id,
      description: "Bucket Access Policy",
      rules: [
        {
          permissionSetNames: ["ObjectStorageFullAccess"],
          projectIds: [_project.then((_project) => _project.id)],
        },
      ],
    },
  );

  // Create API key for bucket access
  const bucketApiKey = new scaleway.iam.ApiKey(gn("bucket-api-key"), {
    applicationId: bucketApp.id,
    description: "API key for bucket access",
  });

  // Create the deployment bucket
  const deploymentBucket = new scaleway.object.Bucket(gn("deployment-bucket"), {
    name: "origan-deployment-bucket",
  });

  // Set bucket to private
  const deploymentBucketAcl = new scaleway.object.BucketAcl(
    gn("deployment-bucket-acl"),
    {
      bucket: deploymentBucket.name,
      acl: "private",
    },
  );

  const config: BucketConfig = {
    bucketUrl: pulumi.interpolate`https://${deploymentBucket.endpoint}`,
    bucketName: deploymentBucket.name,
    bucketAccessKey: bucketApiKey.accessKey,
    bucketSecretKey: bucketApiKey.secretKey,
    bucketRegion: deploymentBucket.region,
  };

  return {
    bucket: deploymentBucket,
    config,
  };
}
