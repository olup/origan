import { getAuthenticatedClient } from "../libs/client.js";
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

  const client = await getAuthenticatedClient();
  const response = await client.environments.listByProjectReference.$post({
    json: { projectReference },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to list environments");
  }

  const data = await response.json();
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

  const client = await getAuthenticatedClient();
  const response = await client.environments.getVariablesByName.$post({
    json: { projectReference, name: environmentName },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get environment variables");
  }

  return await response.json();
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

  const client = await getAuthenticatedClient();
  const response = await client.environments.setVariables.$post({
    json: { projectReference, name: environmentName, variables },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to set environment variables");
  }
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

  const client = await getAuthenticatedClient();
  const response = await client.environments.unsetVariable.$post({
    json: { projectReference, name: environmentName, key },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to unset environment variable");
  }
}
