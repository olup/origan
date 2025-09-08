/**
 * Module for cleaning up stale worker directories
 */

/**
 * Check and cleanup worker directories that haven't been accessed in the specified time
 * @param workerPath Base path to workers directory
 * @param maxAgeMinutes Maximum age in minutes before a directory is considered stale
 */
export async function cleanupStaleWorkers(
  workerPath: string,
  maxAgeMinutes = 30,
): Promise<void> {
  try {
    // Read all entries in the workers directory
    const entries = await Deno.readDir(workerPath);

    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    for await (const entry of entries) {
      if (!entry.isDirectory) continue;

      const dirPath = `${workerPath}/${entry.name}`;
      try {
        // Check for both .ts and .js files
        const possibleFiles = ["index.ts", "index.js"];
        let fileFound = false;

        for (const filename of possibleFiles) {
          const filePath = `${dirPath}/${filename}`;
          try {
            const stat = await Deno.stat(filePath);
            fileFound = true;

            // Check if file is stale
            const lastAccessed = stat.atime?.getTime() ??
              stat.mtime?.getTime() ?? now;
            const fileAge = now - lastAccessed;

            if (fileAge > maxAgeMs) {
              console.log(
                `Removing stale worker directory: ${dirPath} (last accessed ${
                  fileAge / 60000
                } minutes ago)`,
              );
              await Deno.remove(dirPath, { recursive: true });
              break;
            }
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
              console.error(`Error checking file ${filePath}:`, error);
            }
          }
        }

        if (!fileFound) {
          // If no index file exists, clean up the directory
          console.log(
            `Removing worker directory with no index file: ${dirPath}`,
          );
          await Deno.remove(dirPath, { recursive: true });
        }
      } catch (error) {
        console.error(`Error processing directory ${dirPath}:`, error);
      }
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

/**
 * Start the cleanup interval
 * @param workerPath Base path to workers directory
 * @param intervalMinutes Interval in minutes between cleanup runs
 * @returns Timeout ID that can be used to clear the interval
 */
export function startCleanupInterval(
  workerPath: string,
  intervalMinutes = 30,
): number {
  console.log(
    `Starting cleanup interval (every ${intervalMinutes} minutes) for ${workerPath}`,
  );

  // Run initial cleanup
  cleanupStaleWorkers(workerPath, intervalMinutes).catch(console.error);

  // Set up interval for future cleanups
  return setInterval(
    () => {
      cleanupStaleWorkers(workerPath, intervalMinutes).catch(console.error);
    },
    intervalMinutes * 60 * 1000,
  );
}
