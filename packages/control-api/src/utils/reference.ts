import { customAlphabet } from "nanoid";

// Reference prefixes for different entity types
export const REFERENCE_PREFIXES = {
  BUILD: "bld_",
  DEPLOYMENT: "dpl_",
  ORGANIZATION: "org_",
} as const;

export const generateReference = (length = 10, prefix?: string) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const reference = customAlphabet(alphabet)(length);
  return prefix ? `${prefix}${reference}` : reference;
};
