export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** A JSON Schema node. Boolean schemas (`true` / `false`) are valid since draft-06. */
export type SchemaNode = JsonObject | boolean;

export type ConversionMode = "typescript" | "zod" | "both";

export type IndentSize = 2 | 4;

export interface ConversionOptions {
  mode: ConversionMode;
  /** Explicit root type name. Empty means: use the schema title, then `Root`. */
  rootName: string;
  /** Use `title` keywords for generated type names when present. */
  useTitles: boolean;
  indent: IndentSize;
  /** Emit JSDoc tags such as `@minLength 2` in the TypeScript output. */
  constraintComments: boolean;
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  mode: "both",
  rootName: "",
  useTitles: true,
  indent: 2,
  constraintComments: true,
};

export type DiagnosticLevel = "error" | "warning" | "info";

export type DiagnosticSource = "json" | "schema" | "typescript" | "zod";

export interface Diagnostic {
  level: DiagnosticLevel;
  source: DiagnosticSource;
  message: string;
  /** JSON Pointer to the offending schema location, when known. */
  path?: string;
  /** 1-based line and column for JSON syntax errors. */
  line?: number;
  column?: number;
}

export interface SchemaSummary {
  propertyCount: number;
  requiredCount: number;
  maxDepth: number;
  definitionCount: number;
  refCount: number;
  types: string[];
  draft: string;
}

export interface GeneratedOutput {
  code: string | null;
  diagnostics: Diagnostic[];
}

export interface ConversionResult {
  /** True when the input could be parsed and validated as a schema. */
  valid: boolean;
  rootName: string;
  typescript: GeneratedOutput | null;
  zod: GeneratedOutput | null;
  /** Diagnostics about the input itself (JSON syntax and schema structure). */
  diagnostics: Diagnostic[];
  summary: SchemaSummary | null;
  durationMs: number;
}
