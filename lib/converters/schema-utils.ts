import type { JsonObject, JsonValue, SchemaNode } from "./types";

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSchemaNode(value: unknown): value is SchemaNode {
  return typeof value === "boolean" || isPlainObject(value);
}

/** Keywords whose value is a single subschema. */
const SINGLE_SUBSCHEMA_KEYWORDS = [
  "additionalItems",
  "additionalProperties",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contentSchema",
] as const;

/** Keywords whose value is an array of subschemas. */
const ARRAY_SUBSCHEMA_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;

/** Keywords whose value is a map of name -> subschema. */
const MAP_SUBSCHEMA_KEYWORDS = [
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "dependencies",
] as const;

export const DEFINITION_KEYWORDS = new Set(["$defs", "definitions"]);

export interface WalkContext {
  pointer: string;
  /** Number of `properties` keywords between the root and this node. */
  propertyDepth: number;
  /** The keyword under which this node was found, e.g. `properties` or `items`. */
  parentKeyword: string | null;
}

export interface SubschemaEntry {
  keyword: string;
  pointer: string;
  node: SchemaNode;
}

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function joinPointer(base: string, ...segments: string[]): string {
  return segments.reduce((pointer, segment) => `${pointer}/${escapePointerSegment(segment)}`, base);
}

/** Lists the direct subschemas of a node, with their JSON Pointers. */
export function getSubschemas(node: JsonObject, pointer: string): SubschemaEntry[] {
  const entries: SubschemaEntry[] = [];

  for (const keyword of SINGLE_SUBSCHEMA_KEYWORDS) {
    const value = node[keyword];
    if (isSchemaNode(value)) entries.push({ keyword, pointer: joinPointer(pointer, keyword), node: value });
  }

  const items = node.items;
  if (Array.isArray(items)) {
    items.forEach((item, index) => {
      if (isSchemaNode(item)) {
        entries.push({ keyword: "items", pointer: joinPointer(pointer, "items", String(index)), node: item });
      }
    });
  } else if (isSchemaNode(items)) {
    entries.push({ keyword: "items", pointer: joinPointer(pointer, "items"), node: items });
  }

  for (const keyword of ARRAY_SUBSCHEMA_KEYWORDS) {
    const value = node[keyword];
    if (!Array.isArray(value)) continue;
    value.forEach((item, index) => {
      if (isSchemaNode(item)) {
        entries.push({ keyword, pointer: joinPointer(pointer, keyword, String(index)), node: item });
      }
    });
  }

  for (const keyword of MAP_SUBSCHEMA_KEYWORDS) {
    const value = node[keyword];
    if (!isPlainObject(value)) continue;
    for (const [key, child] of Object.entries(value)) {
      // Draft-04/07 `dependencies` mixes subschemas with arrays of property names.
      if (isSchemaNode(child)) {
        entries.push({ keyword, pointer: joinPointer(pointer, keyword, key), node: child });
      }
    }
  }

  return entries;
}

/** Depth-first walk over every object schema node in the document. */
export function walkSchema(
  root: SchemaNode,
  visit: (node: JsonObject, context: WalkContext) => void,
): void {
  const stack: Array<{ node: SchemaNode; context: WalkContext }> = [
    { node: root, context: { pointer: "#", propertyDepth: 0, parentKeyword: null } },
  ];

  while (stack.length > 0) {
    const { node, context } = stack.pop()!;
    if (!isPlainObject(node)) continue;
    visit(node, context);

    const children = getSubschemas(node, context.pointer);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      stack.push({
        node: child.node,
        context: {
          pointer: child.pointer,
          propertyDepth: context.propertyDepth + (child.keyword === "properties" ? 1 : 0),
          parentKeyword: child.keyword,
        },
      });
    }
  }
}

/** Maps each keyword in `keywords` to the pointers of the nodes that use it. */
export function collectKeywordPaths(schema: SchemaNode, keywords: readonly string[]): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  walkSchema(schema, (node, { pointer }) => {
    for (const keyword of keywords) {
      if (node[keyword] !== undefined) usage.set(keyword, [...(usage.get(keyword) ?? []), pointer]);
    }
  });
  return usage;
}

export function formatPaths(paths: string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

export type RefKind = "local" | "anchor" | "external";

export interface ParsedRef {
  kind: RefKind;
  /** Canonical pointer (`#/a/b`) for local refs. */
  pointer: string | null;
  segments: string[];
}

export function parseRef(ref: string): ParsedRef {
  if (ref === "#" || ref === "") return { kind: "local", pointer: "#", segments: [] };
  if (!ref.startsWith("#")) return { kind: "external", pointer: null, segments: [] };
  if (!ref.startsWith("#/")) return { kind: "anchor", pointer: null, segments: [] };

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Keep the raw segment when it is not valid percent-encoding.
      }
      return unescapePointerSegment(decoded);
    });

  return { kind: "local", pointer: joinPointer("#", ...segments), segments };
}

/** Resolves a canonical pointer produced by `parseRef` / `joinPointer`. */
export function resolvePointer(root: JsonValue, segments: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isPlainObject(current)) {
      current = Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined;
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

export function pointerSegments(pointer: string): string[] {
  if (pointer === "#") return [];
  return pointer.slice(2).split("/").map(unescapePointerSegment);
}

const RESERVED_WORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
  "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in",
  "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "let", "static", "yield", "await", "implements",
  "interface", "package", "private", "protected", "public", "any", "boolean", "number", "string",
  "symbol", "unknown", "never", "object", "undefined", "z",
]);

/** Converts arbitrary text (titles, keys) into a safe PascalCase identifier. */
export function toPascalCase(input: string): string {
  const words = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  let name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  if (!name) return "";
  if (/^[0-9]/.test(name)) name = `T${name}`;
  if (RESERVED_WORDS.has(name.toLowerCase()) && name === name.toLowerCase()) name = `${name}Type`;
  return name;
}

export function toKebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function isValidIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

/** Resolves the root type name: explicit name, then schema title, then `Root`. */
export function resolveRootName(schema: JsonObject, explicitName: string, useTitles: boolean): string {
  const fromInput = toPascalCase(explicitName.trim());
  if (fromInput) return fromInput;
  if (useTitles && typeof schema.title === "string") {
    const fromTitle = toPascalCase(schema.title);
    if (fromTitle) return fromTitle;
  }
  return "Root";
}
