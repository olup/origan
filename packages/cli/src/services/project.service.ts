import { getAuthenticatedClient } from "../libs/client.js";
import { log } from "../utils/logger.js";
import { getCurrentOrganization } from "./organization.service.js";

// TODO : Move this to a common place and use it in all services
interface ErrorResponse {
  error: string;
  details?: string;
}

function handleApiError(
  error: ErrorResponse,
  status: number,
  resourceName?: string | undefined,
): never {
  // Handle common status codes
  if (status === 401) {
    log.error("Authentication required. Please login first.");
    process.exit(1);
  }
  if (status === 403) {
    log.error("Access denied. You don't have permission for this action.");
    process.exit(1);
  }
  if (status === 404) {
    log.error(`${resourceName ?? "Resource"} not found.`);
    process.exit(1);
  }

  // For other errors, show the error message
  throw new Error(error.details || error.error);
}

/**
 * Get all projects
 */
export async function getProjects() {
  try {
    // Get current organization
    const currentOrg = await getCurrentOrganization();
    if (!currentOrg) {
      log.error("No organization selected. Please select one first.");
      process.exit(1);
    }

    const client = await getAuthenticatedClient();
    const response = await client.projects.$get({
      query: {
        organizationReference: currentOrg.reference,
      },
    });
    const data = await response.json();

    if ("error" in data) {
      handleApiError(data, response.status as number);
    }

    return data;
  } catch (error) {
    log.error(
      "Failed to fetch projects:",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  }
}

export async function getProjectByRef(projectRef: string) {
  try {
    const projects = await getProjects();
    const project = projects.find((p) => p.reference === projectRef);

    if (!project) {
      log.error(`Project ${projectRef} not found.`);
      process.exit(1);
    }

    return project;
  } catch (error) {
    log.error(
      "Failed to fetch project:",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  }
}

/**
 * Create a new project
 */
export async function createProject(name: string) {
  try {
    // Get current organization
    const currentOrg = await getCurrentOrganization();
    if (!currentOrg) {
      log.error("No organization selected. Please select one first.");
      process.exit(1);
    }

    const client = await getAuthenticatedClient();
    const response = await client.projects.$post({
      json: {
        name,
        organizationReference: currentOrg.reference,
      },
    });

    const data = await response.json();

    if ("error" in data) {
      handleApiError(data, response.status as number);
    }

    return data;
  } catch (error) {
    log.error(
      "Failed to create project:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}
