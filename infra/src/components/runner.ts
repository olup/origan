import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { dockerImageWithTag, rn } from "../utils";
import { BucketConfig } from "./bucket";

interface DeployRunnerOutputs {
  runnerUrl: pulumi.Output<string>;
}

export function deployRunner(
  registry: scaleway.registry.Namespace,
  registryApiKey: scaleway.iam.ApiKey,
  bucketConfig: BucketConfig
): DeployRunnerOutputs {
  const image = dockerImageWithTag(rn("runner-image"), {
    build: {
      context: "../",
      dockerfile: "../Dockerfile",
      platform: "linux/amd64",
      target: "runner",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/runner`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  const ns = new scaleway.containers.Namespace(rn("runner-ns"), {
    name: "runner",
  });

  const container = new scaleway.containers.Container(
    rn("runner-container"),
    {
      name: "runner-container",
      namespaceId: ns.id,
      registryImage: image.imageName,
      port: 9000,
      minScale: 0,
      maxScale: 1,
      privacy: "public",
      protocol: "http1",
      deploy: true,
      memoryLimit: 512,
      cpuLimit: 500,
      environmentVariables: {
        BUCKET_URL: bucketConfig.bucketUrl,
        BUCKET_NAME: bucketConfig.bucketName,
        BUCKET_ACCESS_KEY: bucketConfig.bucketAccessKey,
        BUCKET_REGION: bucketConfig.bucketRegion,
      },
      secretEnvironmentVariables: {
        BUCKET_SECRET_KEY: bucketConfig.bucketSecretKey,
      },
    },
    { deletedWith: ns }
  );

  return {
    runnerUrl: container.domainName,
  };
}
