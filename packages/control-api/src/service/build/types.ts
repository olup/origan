export interface BuildEvent {
  buildId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  timestamp: string;
  error?: string;
  exitCode?: number;
  message?: string;
}

export interface BuildLogEntry {
  timestamp: string;
  level: "info" | "error" | "warn" | "debug";
  message: string;
}

interface LogBatch {
  buildId: string;
  logs: BuildLogEntry[];
  lastFlush: number;
}

export type { LogBatch };
