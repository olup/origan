/**
 * K3s API client for interacting with Kubernetes resources
 */
export interface K3sApiOptions {
  baseUrl?: string;
  token?: string;
  namespace?: string;
}

export class K3sApi {
  readonly baseUrl: string;
  readonly token: string;
  readonly namespace: string;

  constructor(options: K3sApiOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.K3S_API_URL || 'https://62.171.156.174:6443';
    this.token = options.token || process.env.K3S_TOKEN || '';
    this.namespace = options.namespace || 'default';
    
    // For local development, we'll use kubectl proxy or direct SSH
    if (!this.token && process.env.K3S_SSH_HOST) {
      console.log('Using SSH-based kubectl access');
    }
  }

  /**
   * Execute kubectl command via SSH (for development)
   */
  async kubectl(args: string): Promise<any> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const host = process.env.K3S_SSH_HOST || '62.171.156.174';
    const cmd = `ssh root@${host} "kubectl ${args} -o json"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error: any) {
      console.error('kubectl error:', error.message);
      throw error;
    }
  }

  /**
   * Execute kubectl command via SSH and return raw output
   */
  async exec(args: string): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const host = process.env.K3S_SSH_HOST || '62.171.156.174';
    // Escape single quotes in the command for proper shell handling
    const escapedArgs = args.replace(/'/g, "'\\''");
    const cmd = `ssh root@${host} '${escapedArgs}'`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return stdout.trim();
    } catch (error: any) {
      console.error('exec error:', error.message);
      throw error;
    }
  }

  /**
   * Apply a Kubernetes manifest
   */
  async apply(manifest: any): Promise<any> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const host = process.env.K3S_SSH_HOST || '62.171.156.174';
    const manifestJson = JSON.stringify(manifest);
    // Use base64 encoding to avoid shell quoting issues
    const base64Manifest = Buffer.from(manifestJson).toString('base64');
    const cmd = `ssh root@${host} "echo '${base64Manifest}' | base64 -d | kubectl apply -f - -o json"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error: any) {
      console.error('kubectl apply error:', error.message);
      throw error;
    }
  }

  /**
   * Delete a Kubernetes resource
   */
  async delete(kind: string, name: string, namespace?: string): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const host = process.env.K3S_SSH_HOST || '62.171.156.174';
    const ns = namespace || this.namespace;
    const cmd = `ssh root@${host} "kubectl delete ${kind} ${name} -n ${ns}"`;
    
    try {
      await execAsync(cmd);
    } catch (error: any) {
      // Ignore errors if resource doesn't exist
      if (!error.stderr?.includes('NotFound') && !error.stderr?.includes('not found')) {
        throw error;
      }
    }
  }

  /**
   * Get a Kubernetes resource
   */
  async get(kind: string, name: string, namespace?: string): Promise<any> {
    const ns = namespace || this.namespace;
    return await this.kubectl(`get ${kind} ${name} -n ${ns}`);
  }
}