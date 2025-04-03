import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gan, gn } from "../utils";

interface DeployGatewayOutputs {
  gatewayUrl: pulumi.Output<string>;
}

interface BucketConfig {
  bucketUrl: pulumi.Output<string>;
  bucketName: pulumi.Output<string>;
  bucketAccessKey: pulumi.Output<string>;
  bucketSecretKey: pulumi.Output<string>;
}

export function deployGateway(
  registry: scaleway.registry.Namespace,
  registryApiKey: scaleway.iam.ApiKey,
  controlApiUrl: pulumi.Output<string>,
  runnerUrl: pulumi.Output<string>,
  bucketConfig: BucketConfig,
): DeployGatewayOutputs {
  const latest = new docker.Image(gan("gateway-image-latest"), {
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

  const digestTag = latest.repoDigest.apply((digest) =>
    digest.split(":")[1].substring(0, 8),
  );

  const image = new docker.Image(
    gan("gateway-image"),
    {
      build: {
        context: "../",
        dockerfile: "../Dockerfile",
        platform: "linux/amd64",
        target: "gateway",
      },
      imageName: pulumi.interpolate`${registry.endpoint}/gateway:${digestTag}`,
      registry: {
        server: registry.endpoint,
        username: registryApiKey.accessKey,
        password: registryApiKey.secretKey,
      },
    },
    { dependsOn: latest },
  );

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
      environmentVariables: {
        ORIGAN_DOMAIN: "origan.io", // TODO: Make this configurable
        CONTROL_API_URL: pulumi.interpolate`https://${controlApiUrl}`,
        RUNNER_URL: pulumi.interpolate`https://${runnerUrl}`,
        BUCKET_URL: bucketConfig.bucketUrl,
        BUCKET_NAME: bucketConfig.bucketName,
        BUCKET_ACCESS_KEY: bucketConfig.bucketAccessKey,
        BUCKET_SECRET_KEY: bucketConfig.bucketSecretKey,
      },
    },
    { deletedWith: ns },
  );

  return {
    gatewayUrl: container.domainName,
  };
}
