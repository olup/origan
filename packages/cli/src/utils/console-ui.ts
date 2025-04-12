export function table<
  T extends Record<string, string | null>,
  K extends keyof T & string,
>(data: T[], columns: K[] | null = null): void {
  if (data.length === 0) {
    console.log("Empty data set");
    return;
  }

  // Extract all unique keys from all objects
  const headers = columns ?? [...new Set(data.flatMap(Object.keys))];

  // Calculate column widths (maximum of header length and the longest value)
  const columnWidths = headers.reduce(
    (widths, header) => {
      widths[header] = Math.max(
        header.length,
        ...data.map((item) => String(item[header] ?? "").length),
      );
      return widths;
    },
    {} as Record<string, number>,
  );

  // Create header row
  const headerRow = headers
    .map((header) => header.padEnd(columnWidths[header]))
    .join(" | ");

  // Create separator row
  const separatorRow = headers
    .map((header) => "-".repeat(columnWidths[header]))
    .join("-|-");

  // Create data rows
  const dataRows = data.map((item) =>
    headers
      .map((header) => String(item[header] ?? "").padEnd(columnWidths[header]))
      .join(" | "),
  );

  // Print the table
  console.log(headerRow);
  console.log(separatorRow);
  for (const row of dataRows) {
    console.log(row);
  }
}
