import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gn } from "../utils";

export interface RegistryOutputs {
  namespace: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
}

export function deployRegistry(): RegistryOutputs {
  // Create the registry namespace
  const namespace = new scaleway.registry.Namespace(gn("registry"), {
    isPublic: false,
    name: "origan-registry",
  });

  // Create IAM application for registry access
  const registryApp = new scaleway.iam.Application(gn("registry-app"), {
    name: "Registry Access",
    description: "Application for container registry access",
  });

  // Get project ID for policy
  const _project = scaleway.account.getProject({
    name: "origan",
  });

  // Create policy for registry access
  const registryAccessPolicy = new scaleway.iam.Policy(
    gn("registry-access-policy"),
    {
      applicationId: registryApp.id,
      description: "Registry Access Policy",
      rules: [
        {
          projectIds: [_project.then((_project) => _project.id)],
          permissionSetNames: ["ContainerRegistryFullAccess"],
        },
      ],
    }
  );

  // Create API key for registry access
  const registryApiKey = new scaleway.iam.ApiKey(gn("registry-api-key"), {
    applicationId: registryApp.id,
    description: "Registry API Key",
  });

  return {
    namespace,
    registryApiKey,
  };
}
