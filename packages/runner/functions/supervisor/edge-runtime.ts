export interface UserWorker {
  fetch(request: Request): Promise<Response>;
}

export interface EdgeRuntime {
  userWorkers: {
    create(options: {
      servicePath: string;
      memoryLimitMb: number;
      workerTimeoutMs: number;
      noModuleCache: boolean;
      importMapPath: string | null;
      envVars: [string, string][];
    }): Promise<UserWorker>;
  };
}
