import { DRAFT_LABELS, type SchemaDraft } from "./schema-validation";
import { isPlainObject, walkSchema } from "./schema-utils";
import type { JsonObject, SchemaSummary } from "./types";

function inferTypes(node: JsonObject): string[] {
  if (typeof node.type === "string") return [node.type];
  if (Array.isArray(node.type)) return node.type.filter((type): type is string => typeof type === "string");
  if (node.enum !== undefined) return ["enum"];
  if (node.const !== undefined) return ["const"];
  if (node.properties !== undefined) return ["object"];
  if (node.items !== undefined || node.prefixItems !== undefined) return ["array"];
  return [];
}

export function analyzeSchema(schema: JsonObject, draft: SchemaDraft): SchemaSummary {
  let propertyCount = 0;
  let requiredCount = 0;
  let maxDepth = 0;
  let refCount = 0;
  const types = new Set<string>();

  walkSchema(schema, (node, { propertyDepth }) => {
    if (isPlainObject(node.properties)) {
      propertyCount += Object.keys(node.properties).length;
      maxDepth = Math.max(maxDepth, propertyDepth + 1);
    }
    if (Array.isArray(node.required)) requiredCount += node.required.length;
    if (typeof node.$ref === "string") refCount += 1;
    for (const type of inferTypes(node)) types.add(type);
  });

  const definitionCount =
    (isPlainObject(schema.$defs) ? Object.keys(schema.$defs).length : 0) +
    (isPlainObject(schema.definitions) ? Object.keys(schema.definitions).length : 0);

  return {
    propertyCount,
    requiredCount,
    maxDepth,
    definitionCount,
    refCount,
    types: [...types].sort(),
    draft: DRAFT_LABELS[draft],
  };
}
