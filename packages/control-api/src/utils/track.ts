export function sanitizeTrackName(value: string) {
  const lowercase = value.toLowerCase();
  const sanitized = lowercase
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "default";
}
