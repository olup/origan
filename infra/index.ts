import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import * as docker from "@pulumi/docker";

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
    }
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
    }
  );
  const registryApiKey = new scaleway.iam.ApiKey(cn("registry-api-key"), {
    applicationId: pulumiRegistryApp.id,
    description: "Registry API Key",
  });

  const image = new docker.Image(cn("image"), {
    build: {
      context: "../origan-control/",
      dockerfile: "../origan-control/apps/api/Dockerfile",
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
    { deletedWith: ns }
  );
}

deployControl();
