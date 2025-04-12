// This utils is needed to post a form with file from node with progress tracking
// fetch natively does not support this
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

interface FileField {
  path: string;
  fieldName: string;
  fileName?: string;
  contentType?: string;
}

interface FormField {
  fieldName: string;
  value: string;
}

export async function uploadFormWithProgress(
  url: string | URL,
  fields: FormField[],
  files: FileField[],
  onProgress?: (percentage: number) => void,
): Promise<string> {
  // Create a unique boundary for multipart/form-data
  const boundary = `--------------------------${Date.now().toString(16)}`;

  // Calculate total size and prepare form parts
  let totalSize = 0;
  const formParts: { type: "field" | "file"; content: string | FileField }[] =
    [];

  // Add regular form fields
  for (const field of fields) {
    const fieldContent = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${field.fieldName}"`,
      "",
      field.value,
    ].join("\r\n");
    formParts.push({ type: "field", content: fieldContent });
    totalSize += Buffer.byteLength(`${fieldContent}\r\n`);
  }

  // Add files and calculate their sizes
  for (const file of files) {
    const stats = await stat(file.path);
    const fileName = file.fileName || file.path.split("/").pop() || "file";
    const contentType = file.contentType || "application/octet-stream";

    const fileHeader = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${fileName}"`,
      `Content-Type: ${contentType}`,
      "",
      "",
    ].join("\r\n");

    formParts.push({ type: "file", content: file });
    totalSize +=
      Buffer.byteLength(fileHeader) + stats.size + Buffer.byteLength("\r\n");
  }

  // Add closing boundary
  const closingBoundary = `--${boundary}--\r\n`;
  totalSize += Buffer.byteLength(closingBoundary);

  return new Promise((resolve, reject) => {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const requestFn = urlObj.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestFn(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": totalSize.toString(),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Upload failed: ${data}`));
          } else {
            resolve(data);
          }
        });
      },
    );

    req.on("error", reject);

    let uploaded = 0;

    // Helper to track progress
    const trackProgress = (chunk: number) => {
      uploaded += chunk;
      const progress = Math.round((uploaded / totalSize) * 100);
      onProgress?.(progress);
    };

    // Write form parts sequentially
    const writeFormPart = async (index: number) => {
      if (index >= formParts.length) {
        // All parts written, end with closing boundary
        req.write(closingBoundary);
        req.end();
        return;
      }

      const part = formParts[index];

      if (part.type === "field") {
        const content = part.content as string;
        req.write(`${content}\r\n`);
        trackProgress(Buffer.byteLength(`${content}\r\n`));
        writeFormPart(index + 1);
      } else {
        const file = part.content as FileField;
        const fileName = file.fileName || file.path.split("/").pop() || "file";
        const contentType = file.contentType || "application/octet-stream";

        const fileHeader = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${fileName}"`,
          `Content-Type: ${contentType}`,
          "",
          "",
        ].join("\r\n");

        req.write(fileHeader);
        trackProgress(Buffer.byteLength(fileHeader));

        const fileStream = createReadStream(file.path);
        fileStream.on("data", (chunk) => trackProgress(chunk.length));
        fileStream.on("end", () => {
          req.write("\r\n");
          trackProgress(Buffer.byteLength("\r\n"));
          writeFormPart(index + 1);
        });
        fileStream.pipe(req, { end: false });
      }
    };

    // Start writing form parts
    writeFormPart(0);
  });
}
