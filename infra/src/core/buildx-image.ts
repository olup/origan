import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import { gitFingerprint, gitFingerprintSuffix } from "./git.js";

export interface BuildxImageArgs {
  imageName: pulumi.Input<string>;
  context: pulumi.Input<string>;
  dockerfile: pulumi.Input<string>;
  target?: pulumi.Input<string>;
  platform?: pulumi.Input<string>;
  buildArgs?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  additionalTags?: pulumi.Input<pulumi.Input<string>[]>;
  tagSuffix?: pulumi.Input<string>;
}

export interface BuildxImageResult {
  imageName: pulumi.Output<string>;
  uniqueTag: pulumi.Output<string>;
  repoDigest: pulumi.Output<string>;
  allTags: pulumi.Output<string[]>;
  buildResource: command.local.Command;
  digestResource: command.local.Command;
}

function stringifyBuildArgs(args: Record<string, string>): string {
  return Object.entries(args)
    .map(([key, value]) => `--build-arg ${key}=${value}`)
    .join(" ");
}

function buildRepositoryReference(imageName: string, suffix: string): string {
  const match = imageName.match(/^(?<repo>.+?)(?::[^:@]+)?$/);
  const repository = match?.groups?.repo ?? imageName;
  return `${repository}:${suffix}`;
}

export function buildxImage(name: string, args: BuildxImageArgs): BuildxImageResult {
  const primaryTag = pulumi.output(args.imageName);
  const suffix = pulumi.output(args.tagSuffix ?? gitFingerprintSuffix);
  const uniqueTag = pulumi.all([primaryTag, suffix]).apply(([tag, suffixValue]) =>
    buildRepositoryReference(tag, suffixValue),
  );

  const additionalTags = pulumi.output(args.additionalTags ?? []).apply(tags =>
    tags?.map(tag => (typeof tag === "string" ? tag : "")) ?? [],
  );

  const allTags = pulumi.all([primaryTag, uniqueTag, additionalTags]).apply(([primary, unique, extras]) => {
    const merged = new Set<string>();
    if (primary) merged.add(primary);
    if (unique) merged.add(unique);
    (extras ?? []).filter(Boolean).forEach(tag => merged.add(tag));
    return Array.from(merged);
  });

  const tagArgs = allTags.apply(tags => tags.map(tag => `--tag ${tag}`).join(" "));

  const buildArgs = pulumi.output(args.buildArgs ?? {}).apply(resolvedArgs =>
    stringifyBuildArgs(
      Object.fromEntries(
        Object.entries(resolvedArgs ?? {}).map(([key, value]) => [key, value ?? ""]),
      ),
    ),
  );

  const buildCommand = pulumi
    .all([
      pulumi.output(args.context),
      pulumi.output(args.dockerfile),
      pulumi.output(args.target ?? ""),
      pulumi.output(args.platform ?? ""),
      tagArgs,
      buildArgs,
    ])
    .apply(([context, dockerfile, target, platform, tags, buildArguments]) => {
      const targetFragment = target ? ` --target ${target}` : "";
      const platformFragment = platform ? ` --platform ${platform}` : "";
      const buildArgsFragment = buildArguments ? ` ${buildArguments}` : "";
      return `docker buildx build --progress plain --file ${dockerfile}${targetFragment}${platformFragment}${buildArgsFragment} ${tags} --push --provenance=false ${context}`;
    });

  const trigger = pulumi.all([pulumi.output(gitFingerprint), allTags]).apply(([fingerprint, tags]) =>
    JSON.stringify({ fingerprint, tags }),
  );

  const buildResource = new command.local.Command(`${name}-buildx`, {
    create: buildCommand,
    environment: {
      ...process.env,
      DOCKER_BUILDKIT: "1",
    },
    triggers: [trigger],
  });

  const inspectCommand = primaryTag.apply(tag =>
    `docker buildx imagetools inspect ${tag} --format '{{json .Manifest}}'`,
  );

  const digestResource = new command.local.Command(`${name}-digest`, {
    create: inspectCommand,
    triggers: [trigger],
  }, { dependsOn: [buildResource] });

  const repoDigest = pulumi.all([primaryTag, digestResource.stdout]).apply(([tag, manifestJson]) => {
    const repository = (tag ?? "").replace(/:[^:@]+$/, "");
    const trimmed = (manifestJson ?? "").trim();
    if (!trimmed) {
      throw new Error(`Failed to inspect manifest for image ${tag}`);
    }
    let digest: string | undefined;
    try {
      const parsed = JSON.parse(trimmed);
      digest = parsed?.digest;
    } catch (error) {
      throw new Error(`Unable to parse manifest JSON for image ${tag}: ${error}`);
    }
    if (!digest || typeof digest !== "string") {
      throw new Error(`Manifest for image ${tag} does not contain a digest`);
    }
    return `${repository}@${digest}`;
  });

  return {
    imageName: primaryTag,
    uniqueTag,
    repoDigest,
    allTags,
    buildResource,
    digestResource,
  };
}
