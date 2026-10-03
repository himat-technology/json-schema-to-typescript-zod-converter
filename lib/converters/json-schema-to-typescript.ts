import { compile, type JSONSchema } from "json-schema-to-typescript";
import { formatTypeScript } from "./format";
import { RUNTIME_CONSTRAINT_KEYWORDS, TYPESCRIPT_UNSUPPORTED } from "./keywords";
import { collectKeywordPaths, formatPaths, walkSchema } from "./schema-utils";
import type { ConversionOptions, Diagnostic, GeneratedOutput, JsonObject } from "./types";

type TypeScriptOptions = Pick<ConversionOptions, "useTitles" | "indent" | "constraintComments">;

const JSDOC_TAG_KEYWORDS = [...RUNTIME_CONSTRAINT_KEYWORDS, "default"] as const;

function hasType(node: JsonObject, type: string): boolean {
  return node.type === type || (Array.isArray(node.type) && node.type.includes(type));
}

/** `{ "type": "object" }` with no declared shape accepts any keys, so keep an index signature. */
function isShapelessObject(node: JsonObject): boolean {
  return (
    hasType(node, "object") &&
    node.properties === undefined &&
    node.patternProperties === undefined &&
    node.additionalProperties === undefined &&
    node.$ref === undefined &&
    node.allOf === undefined &&
    node.anyOf === undefined &&
    node.oneOf === undefined
  );
}

function constraintTags(node: JsonObject): string[] {
  const tags: string[] = [];
  for (const keyword of JSDOC_TAG_KEYWORDS) {
    const value = node[keyword];
    if (value === undefined || value === false) continue;
    if (value === true) tags.push(`@${keyword}`);
    else tags.push(`@${keyword} ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  return tags;
}

/** Applies naming and documentation options on a copy, never on the user's schema. */
function prepareSchema(schema: JsonObject, rootName: string, options: TypeScriptOptions): JsonObject {
  const prepared = structuredClone(schema);
  prepared.title = rootName;

  walkSchema(prepared, (node, { pointer }) => {
    if (pointer !== "#" && !options.useTitles) delete node.title;
    if (isShapelessObject(node)) node.additionalProperties = true;
    if (options.constraintComments) {
      const tags = constraintTags(node);
      if (tags.length > 0) {
        const description = typeof node.description === "string" ? `${node.description}\n\n` : "";
        node.description = `${description}${tags.join("\n")}`;
      }
    }
  });
  return prepared;
}

function typescriptDiagnostics(schema: JsonObject, options: TypeScriptOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [keyword, paths] of collectKeywordPaths(schema, TYPESCRIPT_UNSUPPORTED)) {
    diagnostics.push({
      level: "warning",
      source: "typescript",
      message: `\`${keyword}\` at ${formatPaths(paths)} cannot be expressed as a TypeScript type and was ignored.`,
      path: paths[0],
    });
  }

  const constraints = [...collectKeywordPaths(schema, RUNTIME_CONSTRAINT_KEYWORDS).keys()];
  if (constraints.length > 0) {
    diagnostics.push({
      level: "info",
      source: "typescript",
      message: options.constraintComments
        ? `Runtime constraints (${constraints.join(", ")}) are not enforceable by TypeScript; they are documented as JSDoc tags. Use the Zod schema for runtime validation.`
        : `Runtime constraints (${constraints.join(", ")}) are not enforceable by TypeScript and were omitted. Use the Zod schema for runtime validation.`,
    });
  }
  return diagnostics;
}

function describeCompileError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "ValidationError" || error.constructor.name === "ValidationError") {
      return "json-schema-to-typescript rejected the schema. Check that minItems/maxItems are non-negative and consistent, `deprecated` is a boolean, and tsEnumNames matches enum.";
    }
    return error.message || error.name;
  }
  return String(error);
}

export async function generateTypeScript(
  schema: JsonObject,
  rootName: string,
  options: TypeScriptOptions,
): Promise<GeneratedOutput> {
  const diagnostics = typescriptDiagnostics(schema, options);
  const prepared = prepareSchema(schema, rootName, options);

  let raw: string;
  try {
    raw = await compile(prepared as JSONSchema, rootName, {
      bannerComment: "",
      format: false,
      additionalProperties: false,
      unreachableDefinitions: true,
      declareExternallyReferenced: true,
      strictIndexSignatures: false,
      unknownAny: true,
      cwd: "/",
      $refOptions: { resolve: { external: false, file: false, http: false } },
    });
  } catch (error) {
    diagnostics.unshift({
      level: "error",
      source: "typescript",
      message: `TypeScript generation failed: ${describeCompileError(error)}`,
    });
    return { code: null, diagnostics };
  }

  try {
    return { code: await formatTypeScript(raw, options.indent), diagnostics };
  } catch (error) {
    diagnostics.push({
      level: "warning",
      source: "typescript",
      message: `Output could not be formatted and is shown as generated: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { code: raw, diagnostics };
  }
}
