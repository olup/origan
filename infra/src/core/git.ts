import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");

function runGit(command: string): string {
  try {
    const output = execSync(command, {
      cwd: repoRoot,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.toString().trim();
  } catch (error) {
    throw new Error(
      `Failed to execute \"${command}\" in ${repoRoot}. Ensure the repository is available: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const gitCommit = runGit("git rev-parse HEAD");
export const gitStatus = runGit("git status --porcelain=v2 --untracked-files=all");
export const gitFingerprint = `${gitCommit}\n${gitStatus}`;
export const gitFingerprintHash = crypto.createHash("sha256").update(gitFingerprint).digest("hex");
export const gitFingerprintSuffix = gitFingerprintHash.slice(0, 12);
