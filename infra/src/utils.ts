import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";

const stack = pulumi.getStack();
export const gn = (name: string) => `global-${name}-${stack}`;
export const cn = (name: string) => `control-${name}-${stack}`;
export const gan = (name: string) => `gateway-${name}-${stack}`;
export const rn = (name: string) => `runner-${name}-${stack}`;

export function objectWithoutUndefined<O extends Record<string, unknown>>(
  obj: O
): { [K in keyof O as undefined extends O[K] ? never : K]: O[K] } {
  // biome-ignore lint/complexity/noForEach:
  Object.keys(obj).forEach((key) => obj[key] === undefined && delete obj[key]);
  return obj;
}

// As we can't tag an image after pushing it to the registry,
// we build and push it once, get a hash, then push it again with the hash as tag.
export const dockerImageWithTag = (name: string, args: docker.ImageArgs) => {
  const latest = new docker.Image(`${name}-latest`, args);
  const digestTag = latest.repoDigest.apply((digest) =>
    digest.split(":")[1].substring(0, 8)
  );
  // Mandatory second image to push the existing one.
  const image = new docker.Image(
    `${name}`,
    {
      ...args,
      imageName: pulumi.interpolate`${args.imageName}:${digestTag}`,
    },
    { dependsOn: latest }
  );

  return {
    image,
    digestTag,
  };
};
