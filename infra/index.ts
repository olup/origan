import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";

const stack = pulumi.getStack();

const gn = (name: string) => `global-${name}-${stack}`;
const cn = (name: string) => `control-${name}-${stack}`;

const registry = new scaleway.registry.Namespace(gn(""), {
  isPublic: false,
  name: "origan-registry",
});

function deployControl() {
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
    acl: "private",
  });

  const controlWebsiteBucket = new scaleway.object.Bucket(
    cn("frontend-bucket"),
    {
      name: "origan-control-frontend",
    },
  );

  new scaleway.object.BucketWebsiteConfiguration(cn("frontend-website"), {
    bucket: controlWebsiteBucket.name,
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
            SCW: "user_id:c40b6172-1529-4f74-b986-96e3e60b2e72",
          },
          Action: "*",
          Resource: ["origan-control-frontend", "origan-control-frontend/*"],
        },
        {
          Sid: "Delegate access",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "origan-control-frontend/*",
        },
      ],
    }),
  });
}

deployControl();
