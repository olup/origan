import { customAlphabet } from "nanoid";

/**
 * Generate a short, DNS-safe subdomain identifier
 * Only uses lowercase letters and numbers to ensure DNS compatibility
 * @param length - Length of the subdomain (default: 8)
 * @returns A random subdomain string
 */
export const generateSubdomain = (length = 8): string => {
  // Use only lowercase letters and numbers for DNS compatibility
  // Avoid characters that could be confused (like 0/o, 1/l)
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  return customAlphabet(alphabet)(length);
};

/**
 * Generate a deployment subdomain in the format: xxxxxxxx--projectdomain
 * @param projectDomain - The project's base domain
 * @returns A deployment subdomain (e.g., "abc12345--myproject")
 */
export const generateDeploymentSubdomain = (projectDomain: string): string => {
  const deploymentId = generateSubdomain(8);
  return `${deploymentId}--${projectDomain}`;
};
