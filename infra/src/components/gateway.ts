import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { dockerImageWithTag, gan } from "../utils";
import { BucketConfig } from "./bucket";

interface DeployGatewayOutputs {
  gatewayUrl: pulumi.Output<string>;
}

export function deployGateway(
  registry: scaleway.registry.Namespace,
  registryApiKey: scaleway.iam.ApiKey,
  controlApiUrl: pulumi.Output<string>,
  runnerUrl: pulumi.Output<string>,
  bucketConfig: BucketConfig
): DeployGatewayOutputs {
  const image = dockerImageWithTag(gan("image"), {
    build: {
      context: "../",
      dockerfile: "../Dockerfile",
      platform: "linux/amd64",
      target: "gateway",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/gateway`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  const ns = new scaleway.containers.Namespace(gan("gateway-ns"), {
    name: "gateway",
  });

  const container = new scaleway.containers.Container(
    gan("gateway-container"),
    {
      name: "gateway-container",
      namespaceId: ns.id,
      registryImage: image.imageName,
      port: 7777,
      minScale: 0,
      maxScale: 1,
      privacy: "public",
      protocol: "http1",
      deploy: true,
      memoryLimit: 512,
      cpuLimit: 500,
      environmentVariables: {
        ORIGAN_DOMAIN: "origan.io", // TODO: Make this configurable
        CONTROL_API_URL: pulumi.interpolate`https://${controlApiUrl}`,
        RUNNER_URL: pulumi.interpolate`https://${runnerUrl}`,

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
    gatewayUrl: container.domainName,
  };
}
