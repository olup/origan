export type LogLevel = "info" | "error" | "warn" | "debug";

export type BuildStatus = "pending" | "in_progress" | "completed" | "failed";

export interface BuildEvent {
  buildId: string;
  status: BuildStatus;
  timestamp: string;
  error?: string;
  exitCode?: number;
  message?: string;
}

export interface BuildLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface DeploymentLogEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  projectId: string;
  deploymentId: string;
  functionPath?: string;
}

export interface NatsConfig {
  server: string;
  nkeyCreds?: string;
}
