import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gn, rn } from "../utils";

interface DeployRunnerOutputs {
  runnerUrl: pulumi.Output<string>;
}

interface BucketConfig {
  bucketUrl: pulumi.Output<string>;
  bucketName: pulumi.Output<string>;
  bucketAccessKey: pulumi.Output<string>;
  bucketSecretKey: pulumi.Output<string>;
}

export function deployRunner(
  registry: scaleway.registry.Namespace,
  registryApiKey: scaleway.iam.ApiKey,
  bucketConfig: BucketConfig,
): DeployRunnerOutputs {
  const latest = new docker.Image(rn("runner-image-latest"), {
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

  const digestTag = latest.repoDigest.apply((digest) =>
    digest.split(":")[1].substring(0, 8),
  );

  const image = new docker.Image(
    rn("runner-image"),
    {
      build: {
        context: "../",
        dockerfile: "../Dockerfile",
        platform: "linux/amd64",
        target: "runner",
      },
      imageName: pulumi.interpolate`${registry.endpoint}/runner:${digestTag}`,
      registry: {
        server: registry.endpoint,
        username: registryApiKey.accessKey,
        password: registryApiKey.secretKey,
      },
    },
    { dependsOn: latest },
  );

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
      environmentVariables: {
        BUCKET_URL: bucketConfig.bucketUrl,
        BUCKET_NAME: bucketConfig.bucketName,
        BUCKET_ACCESS_KEY: bucketConfig.bucketAccessKey,
        BUCKET_SECRET_KEY: bucketConfig.bucketSecretKey,
      },
    },
    { deletedWith: ns },
  );

  return {
    runnerUrl: container.domainName,
  };
}
