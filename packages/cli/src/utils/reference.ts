/**
 * Generates a random 12-character hexadecimal reference ID
 */
export function generateReference(): string {
  return Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}
