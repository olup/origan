import { client } from "../libs/client.js";

/**
 * Get all projects
 */
export async function getProjects() {
  const response = await client.projects.$get();
  const data = await response.json();
  if ("error" in data) {
    throw new Error(
      `Failed to fetch projects: ${(data as { error: string }).error}`,
    );
  }
  return data;
}

/**
 * Create a new project
 */
export async function createProject(name: string) {
  const response = await client.projects.$post({
    json: {
      name,
    },
  });

  const data = await response.json();

  if ("error" in data) {
    throw new Error(
      `Failed to create project: ${(data as { error: string }).error}`,
    );
  }

  return data;
}
