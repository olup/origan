import {
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export function createDirectories(dirs: string[]): void {
  for (const dir of dirs) mkdirSync(dir, { recursive: true });
}

export function collectFiles(dir: string): string[] {
  const files: string[] = [];
  const walkDir = (dir: string) => {
    const dirFiles = readdirSync(dir);
    for (const file of dirFiles) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };
  walkDir(dir);
  return files;
}

export function validateDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function cleanDirectory(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to clean directory ${dir}:`, error);
  }
}

export function writeConfig(
  buildDir: string,
  config: Record<string, unknown>,
): string {
  const configPath = join(buildDir, "config.json");
  const configContent = JSON.stringify(config, null, 2);
  writeFileSync(configPath, configContent);
  return configPath;
}
