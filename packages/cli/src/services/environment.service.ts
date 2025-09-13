import { trpc } from "../libs/trpc-client.js";
import { getCurrentOrganization } from "./organization.service.js";

type Environment = {
  id: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
  variables: Record<string, string>;
};

export async function getEnvironments(
  projectReference: string,
): Promise<Environment[]> {
  const currentOrg = await getCurrentOrganization();
  if (!currentOrg) {
    throw new Error("No organization selected");
  }

  const data = await trpc.environments.listByProject.query({
    projectReference,
  });
  return data.environments;
}

export async function getEnvironmentVariables(
  projectReference: string,
  environmentName: string,
): Promise<{ environment: Environment; variables: Record<string, string> }> {
  const currentOrg = await getCurrentOrganization();
  if (!currentOrg) {
    throw new Error("No organization selected");
  }

  const data = await trpc.environments.getVariablesByName.query({
    projectReference,
    name: environmentName,
  });

  return {
    environment: {
      ...data.environment,
      variables: data.variables,
    },
    variables: data.variables,
  };
}

export async function setEnvironmentVariables(
  projectReference: string,
  environmentName: string,
  variables: Array<{ key: string; value: string }>,
): Promise<void> {
  const currentOrg = await getCurrentOrganization();
  if (!currentOrg) {
    throw new Error("No organization selected");
  }

  await trpc.environments.setVariables.mutate({
    projectReference,
    name: environmentName,
    variables,
  });
}

export async function unsetEnvironmentVariable(
  projectReference: string,
  environmentName: string,
  key: string,
): Promise<void> {
  const currentOrg = await getCurrentOrganization();
  if (!currentOrg) {
    throw new Error("No organization selected");
  }

  await trpc.environments.unsetVariable.mutate({
    projectReference,
    name: environmentName,
    key,
  });
}
