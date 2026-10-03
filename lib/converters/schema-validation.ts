import Ajv, { type ErrorObject } from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import AjvDraft04 from "ajv-draft-04";
import draft06MetaSchema from "ajv/dist/refs/json-schema-draft-06.json";
import { isExtensionKeyword, KNOWN_KEYWORDS } from "./keywords";
import { formatPaths, isPlainObject, isSchemaNode, parseRef, resolvePointer, walkSchema } from "./schema-utils";
import type { Diagnostic, JsonObject, JsonValue } from "./types";

export type SchemaDraft = "draft-04" | "draft-06" | "draft-07" | "2019-09" | "2020-12";

export const DRAFT_LABELS: Record<SchemaDraft, string> = {
  "draft-04": "Draft 4",
  "draft-06": "Draft 6",
  "draft-07": "Draft 7",
  "2019-09": "Draft 2019-09",
  "2020-12": "Draft 2020-12",
};

export function detectDraft(schema: JsonObject): { draft: SchemaDraft; declared: boolean; recognized: boolean } {
  const uri = schema.$schema;
  if (typeof uri !== "string") return { draft: "draft-07", declared: false, recognized: true };
  if (uri.includes("draft-04")) return { draft: "draft-04", declared: true, recognized: true };
  if (uri.includes("draft-06")) return { draft: "draft-06", declared: true, recognized: true };
  if (uri.includes("draft-07")) return { draft: "draft-07", declared: true, recognized: true };
  if (uri.includes("2019-09")) return { draft: "2019-09", declared: true, recognized: true };
  if (uri.includes("2020-12")) return { draft: "2020-12", declared: true, recognized: true };
  return { draft: "draft-07", declared: true, recognized: false };
}

type MetaValidator = { validateSchema: (schema: object) => boolean | Promise<unknown>; errors?: ErrorObject[] | null };

const validatorCache = new Map<SchemaDraft, MetaValidator>();

function getMetaValidator(draft: SchemaDraft): MetaValidator {
  const cached = validatorCache.get(draft);
  if (cached) return cached;

  const options = { allErrors: true, strict: false, validateFormats: false, logger: false } as const;
  let validator: MetaValidator;
  switch (draft) {
    case "draft-04":
      validator = new AjvDraft04(options);
      break;
    case "draft-06": {
      const ajv = new Ajv({ ...options, defaultMeta: draft06MetaSchema.$id });
      ajv.addMetaSchema(draft06MetaSchema);
      validator = ajv;
      break;
    }
    case "2019-09":
      validator = new Ajv2019(options);
      break;
    case "2020-12":
      validator = new Ajv2020(options);
      break;
    default:
      validator = new Ajv(options);
  }
  validatorCache.set(draft, validator);
  return validator;
}

function formatAjvError(error: ErrorObject): string {
  const location = error.instancePath || "(root)";
  let message = error.message ?? "is invalid";
  if (error.keyword === "enum" && Array.isArray(error.params.allowedValues)) {
    message += `: ${error.params.allowedValues.map((value: unknown) => JSON.stringify(value)).join(", ")}`;
  }
  return `${location} ${message}`;
}

/** Picks the most specific Ajv error per location; composite errors are mostly noise. */
function summarizeAjvErrors(errors: ErrorObject[]): Diagnostic[] {
  const byPath = new Map<string, ErrorObject>();
  for (const error of errors) {
    const existing = byPath.get(error.instancePath);
    const isComposite = error.keyword === "anyOf" || error.keyword === "oneOf";
    if (!existing || (["anyOf", "oneOf"].includes(existing.keyword) && !isComposite)) {
      byPath.set(error.instancePath, error);
    }
  }
  return [...byPath.values()].slice(0, 6).map((error) => ({
    level: "error" as const,
    source: "schema" as const,
    message: `Invalid JSON Schema: ${formatAjvError(error)}`,
    path: error.instancePath ? `#${error.instancePath}` : "#",
  }));
}

function validateAgainstMetaSchema(schema: JsonObject, draft: SchemaDraft): Diagnostic[] {
  // Validate without `$schema` so URI spelling variants never break meta-schema lookup.
  const { $schema: _ignored, ...withoutSchemaUri } = schema;
  void _ignored;
  try {
    const validator = getMetaValidator(draft);
    const valid = validator.validateSchema(withoutSchemaUri);
    if (valid === true || !validator.errors) return [];
    return summarizeAjvErrors(validator.errors);
  } catch (error) {
    return [
      {
        level: "warning",
        source: "schema",
        message: `Meta-schema validation could not run: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
}

function checkRange(
  node: JsonObject,
  minKey: string,
  maxKey: string,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const min = node[minKey];
  const max = node[maxKey];
  if (typeof min === "number" && typeof max === "number" && min > max) {
    diagnostics.push({
      level: "error",
      source: "schema",
      message: `\`${minKey}\` (${min}) is greater than \`${maxKey}\` (${max}), so no value can ever be valid.`,
      path: pointer,
    });
  }
}

function checkPattern(pattern: string, pointer: string, diagnostics: Diagnostic[]): void {
  let lastError: unknown;
  for (const flags of ["u", ""]) {
    try {
      new RegExp(pattern, flags);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  diagnostics.push({
    level: "error",
    source: "schema",
    message: `Invalid regular expression ${JSON.stringify(pattern)}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    path: pointer,
  });
}

/** Structural checks the meta-schema cannot express: references, ranges, regexes and unknown keywords. */
function validateSemantics(root: JsonObject): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const unknownKeywords = new Map<string, string[]>();

  walkSchema(root, (node, { pointer }) => {
    for (const keyword of Object.keys(node)) {
      if (!KNOWN_KEYWORDS.has(keyword) && !isExtensionKeyword(keyword)) {
        unknownKeywords.set(keyword, [...(unknownKeywords.get(keyword) ?? []), pointer]);
      }
    }

    checkRange(node, "minLength", "maxLength", pointer, diagnostics);
    checkRange(node, "minimum", "maximum", pointer, diagnostics);
    checkRange(node, "minItems", "maxItems", pointer, diagnostics);
    checkRange(node, "minProperties", "maxProperties", pointer, diagnostics);

    if (typeof node.pattern === "string") checkPattern(node.pattern, pointer, diagnostics);
    if (isPlainObject(node.patternProperties)) {
      for (const pattern of Object.keys(node.patternProperties)) checkPattern(pattern, `${pointer}/patternProperties`, diagnostics);
    }

    if (Array.isArray(node.required) && isPlainObject(node.properties)) {
      const properties = node.properties;
      const missing = node.required.filter(
        (key): key is string => typeof key === "string" && !Object.prototype.hasOwnProperty.call(properties, key),
      );
      if (missing.length > 0) {
        diagnostics.push({
          level: "warning",
          source: "schema",
          message: `Required ${missing.length === 1 ? "property" : "properties"} ${missing.map((key) => `"${key}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} not declared in \`properties\`; ${missing.length === 1 ? "it is" : "they are"} typed as unknown.`,
          path: pointer,
        });
      }
    }

    if (typeof node.$ref === "string") {
      const ref = parseRef(node.$ref);
      if (ref.kind === "external") {
        diagnostics.push({
          level: "error",
          source: "schema",
          message: `External reference "${node.$ref}" is not supported. This tool never fetches remote or file schemas; copy the referenced schema into \`$defs\` and use a local "#/$defs/..." reference.`,
          path: pointer,
        });
      } else if (ref.kind === "anchor") {
        diagnostics.push({
          level: "error",
          source: "schema",
          message: `Anchor reference "${node.$ref}" is not supported. Use a JSON Pointer reference such as "#/$defs/Name".`,
          path: pointer,
        });
      } else {
        const target = resolvePointer(root as JsonValue, ref.segments);
        if (target === undefined) {
          diagnostics.push({
            level: "error",
            source: "schema",
            message: `Missing reference: "${node.$ref}" does not point to anything in this document.`,
            path: pointer,
          });
        } else if (!isSchemaNode(target)) {
          diagnostics.push({
            level: "error",
            source: "schema",
            message: `Malformed reference: "${node.$ref}" points to a ${Array.isArray(target) ? "array" : typeof target}, not a schema.`,
            path: pointer,
          });
        }
      }
    }
  });

  for (const [keyword, paths] of unknownKeywords) {
    diagnostics.push({
      level: "warning",
      source: "schema",
      message: `Unknown keyword \`${keyword}\` at ${formatPaths(paths)} is not part of JSON Schema and is ignored by both generators. Check for typos.`,
      path: paths[0],
    });
  }

  return diagnostics;
}

export interface SchemaValidationResult {
  draft: SchemaDraft;
  diagnostics: Diagnostic[];
}

export function validateSchemaDocument(schema: JsonObject): SchemaValidationResult {
  const { draft, declared, recognized } = detectDraft(schema);
  const diagnostics: Diagnostic[] = [];

  if (declared && !recognized) {
    diagnostics.push({
      level: "warning",
      source: "schema",
      message: `Unrecognized $schema "${String(schema.$schema)}". Validating as Draft 7.`,
    });
  }

  diagnostics.push(...validateAgainstMetaSchema(schema, draft));
  diagnostics.push(...validateSemantics(schema));
  return { draft, diagnostics };
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === "error");
}
