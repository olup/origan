import * as pulumi from "@pulumi/pulumi";
const stack = pulumi.getStack();

export const gn = (name: string) => `global-${name}-${stack}`;
export const cn = (name: string) => `control-${name}-${stack}`;

export function objectWithoutUndefined<O extends Record<string, unknown>>(
  obj: O,
): { [K in keyof O as undefined extends O[K] ? never : K]: O[K] } {
  // biome-ignore lint/complexity/noForEach:
  Object.keys(obj).forEach((key) => obj[key] === undefined && delete obj[key]);
  return obj;
}
