import pc from "picocolors";

export class ProgressBar {
  private width;
  private currentPercentage = 0;

  constructor(width = 30) {
    this.width = width;
    process.stdout.write("\n"); // Initial newline for spacing
  }

  update(percentage: number) {
    this.currentPercentage = percentage;
    const filled = Math.floor((this.width * percentage) / 100);
    const empty = this.width - filled;

    // Create the progress bar using block characters
    const bar = pc.cyan("█".repeat(filled) + "░".repeat(empty));

    // Clear the previous line and create new progress bar
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`Uploading [${bar}] ${percentage}%`);
  }

  finish() {
    process.stdout.write("\n"); // Final newline after completion
  }
}
