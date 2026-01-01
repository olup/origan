import * as fs from "node:fs";
import * as path from "node:path";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { gitFingerprint, gitFingerprintSuffix } from "./git.js";

export interface BakeTarget {
  dockerfile: string;
  context: string;
  target: string;
  tags: string[];
  platforms?: string[];
}

export interface BuildxBakeArgs {
  targets: Record<string, BakeTarget>;
  cacheDir?: string;
  push?: boolean;
}

export interface BuildxBakeResult {
  images: Record<
    string,
    {
      allTags: pulumi.Output<string[]>;
      repoDigest: pulumi.Output<string>;
    }
  >;
  bakeResource: command.local.Command;
}

interface BakeTargetConfig {
  dockerfile: string;
  context: string;
  target: string;
  tags: string[];
  platforms: string[];
  "cache-from": string[];
  "cache-to": string[];
  args?: Record<string, string>;
}

interface BakeConfig {
  group: {
    default: {
      targets: string[];
    };
  };
  target: Record<string, BakeTargetConfig>;
}

/**
 * Builds multiple Docker images in parallel using docker buildx bake.
 * All targets share the same build cache, so common layers (deps, build) are only built once.
 */
export function buildxBake(
  name: string,
  args: BuildxBakeArgs,
): BuildxBakeResult {
  const push = args.push ?? true;

  // Generate bake configuration
  const bakeConfig: BakeConfig = {
    group: {
      default: {
        targets: Object.keys(args.targets),
      },
    },
    target: {},
  };

  // Use GitHub Actions cache when running in CI, otherwise use registry cache
  const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
  const cacheFrom = isGitHubActions
    ? ["type=gha"]
    : [
        "type=registry,ref=registry.platform.origan.dev/origan/buildcache:latest",
      ];
  const cacheTo = isGitHubActions
    ? ["type=gha,mode=max"]
    : [
        "type=registry,ref=registry.platform.origan.dev/origan/buildcache:latest,mode=max",
      ];

  // Pass Turbo cache credentials if available (for remote cache in Docker builds)
  const buildArgs: Record<string, string> = {};
  if (process.env.TURBO_TOKEN) {
    buildArgs.TURBO_TOKEN = process.env.TURBO_TOKEN;
  }
  if (process.env.TURBO_TEAM) {
    buildArgs.TURBO_TEAM = process.env.TURBO_TEAM;
  }

  for (const [targetName, target] of Object.entries(args.targets)) {
    bakeConfig.target[targetName] = {
      dockerfile: target.dockerfile,
      context: target.context,
      target: target.target,
      tags: target.tags,
      platforms: target.platforms ?? ["linux/amd64"],
      "cache-from": cacheFrom,
      "cache-to": cacheTo,
      ...(Object.keys(buildArgs).length > 0 && { args: buildArgs }),
    };
  }

  // Write bake config to a temporary file in the infra directory
  const bakeConfigPath = path.resolve(
    process.cwd(),
    "..",
    "docker-bake.generated.json",
  );
  const bakeConfigJson = JSON.stringify(bakeConfig, null, 2);
  fs.writeFileSync(bakeConfigPath, bakeConfigJson);

  // Build the bake command
  const pushFlag = push ? "--push" : "--load";
  const bakeCommand = `docker buildx bake --allow=fs.read=.. -f docker-bake.generated.json ${pushFlag} --provenance=false`;

  // Trigger rebuild when git state changes or targets change
  const trigger = pulumi
    .output(gitFingerprint)
    .apply((fingerprint) =>
      JSON.stringify({ fingerprint, config: bakeConfigJson }),
    );

  // Run bake command from monorepo root
  const bakeResource = new command.local.Command(`${name}-bake`, {
    create: bakeCommand,
    dir: path.resolve(process.cwd(), ".."), // Run from monorepo root
    environment: {
      ...process.env,
      DOCKER_BUILDKIT: "1",
    },
    triggers: [trigger],
  });

  // Get digests for each image after bake completes
  const images: BuildxBakeResult["images"] = {};

  for (const [targetName, target] of Object.entries(args.targets)) {
    const primaryTag = target.tags[0];

    const digestResource = new command.local.Command(
      `${name}-${targetName}-digest`,
      {
        create: `docker buildx imagetools inspect ${primaryTag} --format '{{json .Manifest}}'`,
        triggers: [trigger],
      },
      { dependsOn: [bakeResource] },
    );

    const repoDigest = pulumi
      .all([pulumi.output(primaryTag), digestResource.stdout])
      .apply(([tag, manifestJson]) => {
        const repository = tag.replace(/:[^:@]+$/, "");
        const trimmed = (manifestJson ?? "").trim();
        if (!trimmed) {
          throw new Error(`Failed to inspect manifest for image ${tag}`);
        }
        let digest: string | undefined;
        try {
          const parsed = JSON.parse(trimmed);
          digest = parsed?.digest;
        } catch (error) {
          throw new Error(
            `Unable to parse manifest JSON for image ${tag}: ${error}`,
          );
        }
        if (!digest || typeof digest !== "string") {
          throw new Error(
            `Manifest for image ${tag} does not contain a digest`,
          );
        }
        return `${repository}@${digest}`;
      });

    images[targetName] = {
      allTags: pulumi.output(target.tags),
      repoDigest,
    };
  }

  return {
    images,
    bakeResource,
  };
}

/**
 * Helper to create standard Origan image tags
 */
export function createImageTags(
  registry: string,
  imageName: string,
  baseTag: string,
): string[] {
  return [
    `${registry}/origan/${imageName}:${baseTag}`,
    `${registry}/origan/${imageName}:${gitFingerprintSuffix}`,
    `${registry}/origan/${imageName}:latest`,
  ];
}
