import { createRequire } from "node:module";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";

const require = createRequire(import.meta.url);
const Table = require("cli-table3");

const MIN_COLUMN_WIDTH = 10;
const FALLBACK_TERMINAL_WIDTH = 120;

function visibleWidth(value: string): number {
  return stringWidth(stripAnsi(value));
}

function computeColumnWidths(
  headers: string[],
  rows: string[][],
  terminalWidth: number,
): number[] {
  const maxWidths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => visibleWidth(row[index] ?? ""));
    return Math.max(visibleWidth(header), ...cellWidths);
  });

  const minTotal = headers.length * MIN_COLUMN_WIDTH;
  if (terminalWidth <= minTotal) {
    return headers.map(() => MIN_COLUMN_WIDTH);
  }

  const desired = maxWidths.map((width) => Math.max(width, MIN_COLUMN_WIDTH));
  const totalDesired = desired.reduce((sum, width) => sum + width, 0);
  if (totalDesired <= terminalWidth) {
    return desired;
  }

  const remaining = terminalWidth - minTotal;
  const flexTotal = desired.reduce(
    (sum, width) => sum + (width - MIN_COLUMN_WIDTH),
    0,
  );

  const widths = desired.map((width) =>
    Math.floor(
      MIN_COLUMN_WIDTH + ((width - MIN_COLUMN_WIDTH) / flexTotal) * remaining,
    ),
  );

  let leftover = terminalWidth - widths.reduce((sum, width) => sum + width, 0);
  let index = 0;
  while (leftover > 0) {
    widths[index % widths.length] += 1;
    leftover -= 1;
    index += 1;
  }

  return widths;
}

export function table<
  T extends Record<string, string | null>,
  K extends keyof T & string,
>(data: T[], columns: K[] | null = null): void {
  if (data.length === 0) {
    console.log("Empty data set");
    return;
  }

  const headers = columns ?? [...new Set(data.flatMap(Object.keys))];
  const rows = data.map((item) =>
    headers.map((header) => String(item[header] ?? "")),
  );

  const terminalWidth = process.stdout.columns ?? FALLBACK_TERMINAL_WIDTH;
  const columnWidths = computeColumnWidths(headers, rows, terminalWidth);

  const tableInstance = new Table({
    head: headers,
    colWidths: columnWidths,
    wordWrap: true,
  });

  tableInstance.push(...rows);
  console.log(tableInstance.toString());
}
