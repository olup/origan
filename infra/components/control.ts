import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { ViteProject } from "./vite-project";
import path = require("node:path");
import { cn } from "../utils";

export function deployControl(registry: scaleway.registry.Namespace) {
  const _project = scaleway.account.getProject({
    name: "origan",
  });
  const pulumiRegistryApp = new scaleway.iam.Application(
    cn("pulumi-registry"),
    {
      name: "Pulumi Registry Access",
    },
  );
  const registryAccessPolicy = new scaleway.iam.Policy(
    cn("registry-access-policy"),
    {
      applicationId: pulumiRegistryApp.id,
      description: "Registry Access Policy",
      rules: [
        {
          projectIds: [_project.then((_project) => _project.id)],
          permissionSetNames: ["ContainerRegistryFullAccess"],
        },
      ],
    },
  );
  const registryApiKey = new scaleway.iam.ApiKey(cn("registry-api-key"), {
    applicationId: pulumiRegistryApp.id,
    description: "Registry API Key",
  });

  const image = new docker.Image(cn("image"), {
    build: {
      context: "../",
      dockerfile: "../Dockerfile",
      platform: "linux/amd64",
      target: "control-api",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/control-api`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  const ns = new scaleway.containers.Namespace(cn("ns"), {
    name: "control",
  });

  const container = new scaleway.containers.Container(
    cn("container"),
    {
      name: "control-container",
      namespaceId: ns.id,
      registryImage: pulumi.interpolate`${image.imageName}:latest`,
      port: 9999,
      minScale: 0,
      maxScale: 1,
      privacy: "public",
      protocol: "http1",
      deploy: true,
    },
    { deletedWith: ns },
  );

  const deploymentBucket = new scaleway.object.Bucket(cn("deployment-bucket"), {
    name: "deployment-bucket",
  });
  const deploymentBucketAcl = new scaleway.object.BucketAcl(
    cn("deployment-bucket"),
    {
      bucket: deploymentBucket.name,
      acl: "private",
    },
  );

  const controlWebsiteBucket = new scaleway.object.Bucket(
    cn("frontend-bucket"),
    {
      name: "origan-control-frontend",
    },
  );

  const controlWebsiteBucketAcl = new scaleway.object.BucketAcl(
    cn("frontend-bucket-acl"),
    {
      bucket: controlWebsiteBucket.name,
      acl: "public-read",
    },
  );

  new scaleway.object.BucketWebsiteConfiguration(cn("frontend-website"), {
    bucket: controlWebsiteBucket.name,
    region: "fr-par",
    indexDocument: {
      suffix: "index.html",
    },
    errorDocument: {
      key: "index.html",
    },
  });

  // TODO make this declaration liked to actual objects rather than hardcoded
  new scaleway.object.BucketPolicy(cn("frontend-bucket-policy"), {
    bucket: controlWebsiteBucket.name,
    policy: JSON.stringify({
      Version: "2023-04-17",
      Id: "MyBucketPolicy",
      Statement: [
        {
          Sid: "Allow owner",
          Effect: "Allow",
          Principal: {
            SCW: [
              // Loup
              "user_id:c40b6172-1529-4f74-b986-96e3e60b2e72",
              // Jocelyn
              "user_id:e857b7ce-0b4a-4160-9538-4930bc482cc8",
            ],
          },
          Action: "*",
          Resource: ["origan-control-frontend", "origan-control-frontend/*"],
        },
        {
          Sid: "Delegate access",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: ["origan-control-frontend/*"],
        },
      ],
    }),
  });

  const viteProject = new ViteProject("vite-project", {
    folderPath: path.join(__dirname, "..", "..", "packages", "control", "frontend"),
  });
  viteProject.deploy(controlWebsiteBucket);
}
