import { MAX_INPUT_BYTES } from "@/lib/converters/parse";

const ACCEPTED_MIME_TYPES = new Set(["application/json", "application/schema+json", "text/json", "text/plain", ""]);

export class FileUploadError extends Error {}

/** Reads a user-selected file as text after checking its extension, type and size. */
export async function readJsonFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".json")) {
    throw new FileUploadError(`"${file.name}" is not a .json file. Only .json files are supported.`);
  }
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    throw new FileUploadError(`"${file.name}" has an unsupported type (${file.type}). Upload a JSON Schema file.`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new FileUploadError(`"${file.name}" is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`);
  }
  if (file.size === 0) {
    throw new FileUploadError(`"${file.name}" is empty.`);
  }
  try {
    return await file.text();
  } catch (error) {
    throw new FileUploadError(`Could not read "${file.name}": ${error instanceof Error ? error.message : String(error)}`);
  }
}
