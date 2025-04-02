/**
 * Origan configuration file schema
 */
export interface OriganConfig {
  /** Config schema version */
  version: 1;
  /** Directory containing built app files */
  appDir: string;
  /** Optional directory containing serverless API functions */
  apiDir?: string;
  /** Reference to the project in the Origan control panel */
  projectRef: string;
}
