import { isPlainObject } from "./schema-utils";
import type { Diagnostic, JsonObject } from "./types";

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export type ParseResult =
  | { ok: true; value: JsonObject }
  | { ok: false; diagnostics: Diagnostic[] };

function lineAndColumn(text: string, position: number): { line: number; column: number } {
  const lines = text.slice(0, position).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function describeJsonError(text: string, error: unknown): Diagnostic {
  const raw = error instanceof Error ? error.message : String(error);
  const diagnostic: Diagnostic = { level: "error", source: "json", message: `Invalid JSON: ${raw}` };

  const lineMatch = /line (\d+) column (\d+)/i.exec(raw);
  const positionMatch = /position (\d+)/i.exec(raw);
  if (lineMatch) {
    diagnostic.line = Number(lineMatch[1]);
    diagnostic.column = Number(lineMatch[2]);
  } else if (positionMatch) {
    Object.assign(diagnostic, lineAndColumn(text, Number(positionMatch[1])));
  }

  if (diagnostic.line !== undefined) {
    const cleaned = raw.replace(/\s*(in JSON )?at position \d+.*$/i, "").replace(/\s*\(line \d+ column \d+\)/i, "");
    diagnostic.message = `Invalid JSON at line ${diagnostic.line}, column ${diagnostic.column}: ${cleaned}`;
  }
  return diagnostic;
}

/** Parses editor text and checks that the root is a JSON object. */
export function parseSchemaText(text: string): ParseResult {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) {
    return { ok: false, diagnostics: [{ level: "error", source: "json", message: "Input is empty. Paste a JSON Schema or load a sample." }] };
  }
  if (new TextEncoder().encode(source).length > MAX_INPUT_BYTES) {
    return {
      ok: false,
      diagnostics: [{ level: "error", source: "json", message: `Input exceeds the ${MAX_INPUT_BYTES / 1024 / 1024} MB limit.` }],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, diagnostics: [describeJsonError(source, error)] };
  }

  if (!isPlainObject(value)) {
    const kind = Array.isArray(value) ? "an array" : value === null ? "null" : `a ${typeof value}`;
    return {
      ok: false,
      diagnostics: [
        { level: "error", source: "schema", message: `The root value is ${kind}. A JSON Schema document must be a JSON object.` },
      ],
    };
  }
  return { ok: true, value };
}
