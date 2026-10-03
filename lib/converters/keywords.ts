/** Every keyword defined by JSON Schema drafts 4 through 2020-12, plus common extensions. */
export const KNOWN_KEYWORDS = new Set([
  // Core
  "$schema", "$id", "id", "$ref", "$defs", "definitions", "$comment", "$anchor", "$dynamicRef",
  "$dynamicAnchor", "$recursiveRef", "$recursiveAnchor", "$vocabulary",
  // Applicators
  "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "dependentSchemas", "prefixItems", "items",
  "additionalItems", "contains", "properties", "patternProperties", "additionalProperties",
  "propertyNames", "unevaluatedItems", "unevaluatedProperties", "dependencies",
  // Validation
  "type", "enum", "const", "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
  "maxLength", "minLength", "pattern", "maxItems", "minItems", "uniqueItems", "maxContains",
  "minContains", "maxProperties", "minProperties", "required", "dependentRequired",
  // Format and content
  "format", "contentEncoding", "contentMediaType", "contentSchema",
  // Meta-data
  "title", "description", "default", "deprecated", "readOnly", "writeOnly", "examples",
  // OpenAPI and json-schema-to-typescript extensions
  "nullable", "tsType", "tsEnumNames", "discriminator", "example", "xml", "externalDocs",
]);

export function isExtensionKeyword(keyword: string): boolean {
  return keyword.startsWith("x-");
}

/** Constraints that TypeScript's type system cannot express. */
export const RUNTIME_CONSTRAINT_KEYWORDS = [
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format",
  "uniqueItems", "minProperties", "maxProperties",
] as const;

/** Keywords json-schema-to-typescript ignores and TypeScript cannot model. */
export const TYPESCRIPT_UNSUPPORTED = [
  "not", "if", "then", "else", "dependentSchemas", "dependentRequired", "dependencies",
  "contains", "minContains", "maxContains", "propertyNames", "unevaluatedProperties",
  "unevaluatedItems", "$dynamicRef", "$recursiveRef",
] as const;

/** Keywords the Zod generator does not translate. */
export const ZOD_UNSUPPORTED = [
  "not", "if", "then", "else", "dependentSchemas", "dependentRequired", "dependencies",
  "contains", "minContains", "maxContains", "propertyNames", "patternProperties",
  "unevaluatedProperties", "unevaluatedItems", "contentEncoding", "contentMediaType",
  "contentSchema", "$dynamicRef", "$recursiveRef",
] as const;

/** Annotation-only keywords that never affect validation. */
export const ANNOTATION_KEYWORDS = [
  "default", "examples", "example", "readOnly", "writeOnly", "deprecated", "$comment",
] as const;

/** String formats the Zod generator maps to a dedicated validator. */
export const ZOD_STRING_FORMATS: Record<string, string> = {
  email: "z.email()",
  uri: "z.url()",
  iri: "z.url()",
  url: "z.url()",
  uuid: "z.uuid()",
  "date-time": "z.iso.datetime({ offset: true })",
  date: "z.iso.date()",
  duration: "z.iso.duration()",
  ipv4: "z.ipv4()",
  ipv6: "z.ipv6()",
  hostname: "z.hostname()",
};
