import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { ViteProject } from "./vite-project";
import path = require("node:path");
import { cn } from "../utils";
import type { DatabaseOutputs } from "./database";

interface DeployFrontendOutputs {
  bucket: scaleway.object.Bucket;
  bucketWebsite: scaleway.object.BucketWebsiteConfiguration;
}

interface DeployApiOutputs {
  apiUrl: pulumi.Output<string>;
}

export function deployControl(
  registry: scaleway.registry.Namespace,
  db: DatabaseOutputs,
) {
  const { registryApiKey } = deployRegistry();
  const frontend = configureFrontendDeploy();
  const controlApiUrl = deployApi(
    registry,
    registryApiKey,
    pulumi.interpolate`https://${frontend.bucketWebsite.websiteEndpoint}`,
    db,
  ).apiUrl;

  const viteProject = new ViteProject(cn("frontend-vite-project"), {
    folderPath: path.join(
      __dirname,
      "..",
      "..",
      "..",
      "packages",
      "control",
      "frontend",
    ),
    buildEnv: controlApiUrl.apply((url) => {
      return {
        VITE_API_URL: `https://${url}`,
      };
    }),
  });
  viteProject.deploy(frontend.bucket);

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
}

function configureFrontendDeploy(): DeployFrontendOutputs {
  const bucket = new scaleway.object.Bucket(cn("frontend-bucket"), {
    name: "origan-control-frontend",
  });

  const bucketAcl = new scaleway.object.BucketAcl(cn("frontend-bucket-acl"), {
    bucket: bucket.name,
    acl: "public-read",
  });

  const bucketWebsiteConfig = new scaleway.object.BucketWebsiteConfiguration(
    cn("frontend-website"),
    {
      bucket: bucket.name,
      region: "fr-par",
      indexDocument: {
        suffix: "index.html",
      },
      errorDocument: {
        key: "index.html",
      },
    },
  );

  // TODO make this declaration liked to actual objects rather than hardcoded
  new scaleway.object.BucketPolicy(cn("frontend-bucket-policy"), {
    bucket: bucket.name,
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

  return {
    bucket: bucket,
    bucketWebsite: bucketWebsiteConfig,
  };
}

function deployApi(
  registry: scaleway.registry.Namespace,
  registryApiKey: scaleway.iam.ApiKey,
  frontendDomain: pulumi.Output<string>,
  db: DatabaseOutputs,
): DeployApiOutputs {
  const latest = new docker.Image(cn("image-latest"), {
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
  const digestTag = latest.repoDigest.apply((digest) =>
    digest.split(":")[1].substring(0, 8),
  );
  // Mandatory second image to push the existing one.
  const image = new docker.Image(
    cn("image"),
    {
      build: {
        context: "../",
        dockerfile: "../Dockerfile",
        platform: "linux/amd64",
        target: "control-api",
      },
      imageName: pulumi.interpolate`${registry.endpoint}/control-api:${digestTag}`,
      registry: {
        server: registry.endpoint,
        username: registryApiKey.accessKey,
        password: registryApiKey.secretKey,
      },
    },
    { dependsOn: latest },
  );

  const ns = new scaleway.containers.Namespace(cn("ns"), {
    name: "control",
  });

  const container = new scaleway.containers.Container(
    cn("container"),
    {
      name: "control-container",
      namespaceId: ns.id,
      registryImage: image.imageName,
      port: 9999,
      healthChecks: [
        {
          https: [{ path: "/.healthz" }],
          failureThreshold: 3,
          interval: "5s",
        },
      ],
      minScale: 0,
      maxScale: 1,
      privacy: "public",
      protocol: "http1",
      deploy: true,
      environmentVariables: {
        CORS_ORIGIN: frontendDomain,
        DATABASE_RUN_MIGRATIONS: "true",
      },
      secretEnvironmentVariables: {
        // TODO: Add back ?sslmode=require. Currently, it gives a "Error: self-signed certificate"
        // error with node-postgres.
        DATABASE_URL: pulumi.interpolate`postgresql://${db.user}:${db.password.apply(encodeURIComponent)}@${db.host}:${db.port}/${db.database}`,
      },
    },
    { deletedWith: ns },
  );

  return {
    apiUrl: container.domainName,
  };
}

function deployRegistry(): { registryApiKey: scaleway.iam.ApiKey } {
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

  return {
    registryApiKey: registryApiKey,
  };
}
