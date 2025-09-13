import type { AppRouter } from "@origan/control-api/src/trpc/router";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "../libs/trpc-client.js";
import { log } from "../utils/logger.js";
import { getCurrentOrganization } from "./organization.service.js";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Project = RouterOutput["projects"]["list"][number];

// TODO : Move this to a common place and use it in all services
interface ErrorResponse {
  error: string;
  details?: string;
}

function _handleApiError(
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

    return await trpc.projects.list.query({
      organizationReference: currentOrg.reference,
    });
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
    const project = projects.find((p: Project) => p.reference === projectRef);

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

    return await trpc.projects.create.mutate({
      name,
      organizationReference: currentOrg.reference,
    });
  } catch (error) {
    log.error(
      "Failed to create project:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}
