import { exec, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import alchemy, { type Context, Resource } from 'alchemy';

const execAsync = promisify(exec);

export interface DockerImageProps {
    registryUrl: string;
    imageName: string;
    tag?: string;
    dockerfile?: string;
    context?: string;
    buildArgs?: Record<string, string>;
    platforms?: string[];
    push?: boolean;
    target?: string;  // Target stage for multistage builds
}

export interface DockerImage extends Resource<'docker::Image'>, DockerImageProps {
    fullImageUrl: string;
    digest?: string;
    tag: string;
}

async function dockerLogin(registryUrl: string): Promise<void> {
    // Check if already logged in
    try {
        const { stdout } = await execAsync("docker info --format '{{json .}}'");
        const info = JSON.parse(stdout);
        if (info.RegistryConfig?.IndexConfigs?.[registryUrl]) {
            console.log(`✅ Already logged in to ${registryUrl}`);
            return;
        }
    } catch (_error) {
        // Continue with login attempt
    }

    // Try to login using existing Docker config
    console.log(`🔐 Attempting to login to ${registryUrl}...`);

    // For local registries, try without credentials first
    if (registryUrl.includes('localhost') || registryUrl.includes('127.0.0.1') || registryUrl.includes('registry.platform.origan.dev')) {
        console.log(`ℹ️  Registry detected, skipping login`);
        return;
    }

    // Check if we can pull/push without explicit login (existing credentials)
    try {
        await execAsync(`docker pull ${registryUrl}/test:latest`, { timeout: 5000 });
        console.log(`✅ Registry accessible with existing credentials`);
        return;
    } catch (_error) {
        // Registry might not have test image, but that's okay
        console.log(`ℹ️  Proceeding with existing Docker credentials`);
    }
}

async function buildImage(
    imageUrl: string,
    contextPath: string,
    dockerfile: string,
    buildArgs?: Record<string, string>,
    platforms?: string[],
    target?: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        // Ensure dockerfile path is absolute or relative to context
        const dockerfilePath = path.isAbsolute(dockerfile) 
            ? dockerfile 
            : path.join(contextPath, dockerfile);
        
        const args = ['build', '-t', imageUrl, '-f', dockerfilePath];

        // Add target stage if specified
        if (target) {
            args.push('--target', target);
        }

        // Add build arguments
        if (buildArgs) {
            for (const [key, value] of Object.entries(buildArgs)) {
                args.push('--build-arg', `${key}=${value}`);
            }
        }

        // Add platform if specified
        if (platforms && platforms.length > 0) {
            args.push('--platform', platforms.join(','));
        }

        // Add context path at the end
        args.push(contextPath);

        console.log(`🔨 Running: docker ${args.join(' ')}`);

        const buildProcess = spawn('docker', args, {
            stdio: 'inherit', // This will stream output directly to console
        });

        buildProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Successfully built ${imageUrl}`);
                resolve();
            } else {
                reject(new Error(`Docker build failed with code ${code}`));
            }
        });

        buildProcess.on('error', (err) => {
            reject(new Error(`Failed to start docker build: ${err.message}`));
        });
    });
}

async function pushImage(imageUrl: string): Promise<string | undefined> {
    console.log(`📤 Pushing ${imageUrl} to registry...`);

    try {
        const { stdout } = await execAsync(`docker push ${imageUrl}`);
        console.log(`✅ Successfully pushed ${imageUrl}`);

        // Extract digest from push output
        const digestMatch = stdout.match(/digest:\s*(sha256:[a-f0-9]+)/i);
        if (digestMatch) {
            console.log(`   Digest: ${digestMatch[1]}`);
            return digestMatch[1];
        }

        return undefined;
    } catch (error: any) {
        throw new Error(`Failed to push image: ${error.message}`);
    }
}

export const DockerImage = Resource(
    'docker::Image',
    async function (
        this: Context<DockerImage>,
        id: string,
        props: DockerImageProps,
    ): Promise<DockerImage> {
        const tag = props.tag || 'latest';
        const dockerfile = props.dockerfile || 'Dockerfile';
        const contextPath = props.context || '.';
        const push = props.push !== false; // Default to true

        // Construct full image URL
        const fullImageUrl = `${props.registryUrl}/${props.imageName}:${tag}`;

        if (this.phase === 'delete') {
            console.log(`🗑️  Docker image ${fullImageUrl} will remain in registry`);
            return this.destroy();
        }

        console.log(`🚀 Building Docker image: ${fullImageUrl}`);

        try {
            // Ensure Docker is available
            try {
                await execAsync('docker --version');
            } catch (_error) {
                throw new Error('Docker is not installed or not in PATH');
            }

            // Check if Dockerfile exists
            const dockerfilePath = path.isAbsolute(dockerfile)
                ? dockerfile
                : path.join(contextPath, dockerfile);

            try {
                await fs.access(dockerfilePath);
                console.log(`📋 Using Dockerfile at ${dockerfilePath}`);
            } catch (_error) {
                throw new Error(`Dockerfile not found at ${dockerfilePath}`);
            }

            // Login to registry if pushing
            if (push) {
                await dockerLogin(props.registryUrl);
            }

            // Build the image
            console.log(`📦 Building Docker image: ${fullImageUrl}`);
            if (props.platforms && props.platforms.length > 0) {
                console.log(`   Platforms: ${props.platforms.join(', ')}`);
            }

            // Pass the dockerfile path as-is to buildImage (it will handle path resolution)
            await buildImage(fullImageUrl, contextPath, props.dockerfile || 'Dockerfile', props.buildArgs, props.platforms, props.target);

            // Push if requested
            let digest: string | undefined;
            if (push) {
                digest = await pushImage(fullImageUrl);
            } else {
                console.log(`ℹ️  Push disabled, image available locally`);
            }

            return this({
                ...props,
                fullImageUrl,
                digest,
                tag,
            });
        } catch (error: any) {
            console.error(`❌ Failed to build/push Docker image: ${error.message}`);
            throw error;
        }
    },
);