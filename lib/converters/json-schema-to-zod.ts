import { formatTypeScript } from "./format";
import { ANNOTATION_KEYWORDS, ZOD_STRING_FORMATS, ZOD_UNSUPPORTED } from "./keywords";
import {
  collectKeywordPaths,
  DEFINITION_KEYWORDS,
  formatPaths,
  getSubschemas,
  isPlainObject,
  isSchemaNode,
  isValidIdentifier,
  joinPointer,
  parseRef,
  resolvePointer,
  toPascalCase,
  walkSchema,
} from "./schema-utils";
import type {
  ConversionOptions,
  Diagnostic,
  GeneratedOutput,
  JsonObject,
  JsonValue,
  SchemaNode,
} from "./types";

type ZodOptions = Pick<ConversionOptions, "useTitles" | "indent">;

interface NamedSchema {
  pointer: string;
  constName: string;
  typeName: string;
  node: SchemaNode;
  order: number;
}

/**
 * A generated Zod expression. `deferred` means it references a schema that is not yet
 * initialised (a recursive reference), so it must be evaluated lazily via an object getter.
 */
interface Expr {
  code: string;
  deferred: boolean;
}

const UNSUPPORTED_SET = new Set<string>(ZOD_UNSUPPORTED);

const OBJECT_HINTS = ["properties", "additionalProperties", "patternProperties", "required", "minProperties", "maxProperties"];
const ARRAY_HINTS = ["items", "prefixItems", "additionalItems", "minItems", "maxItems", "uniqueItems"];
const STRING_HINTS = ["minLength", "maxLength", "pattern", "format"];
const NUMBER_HINTS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"]);
/** Pointer segments that are keywords rather than meaningful names, e.g. in `#/properties/address`. */
const POINTER_KEYWORDS = new Set([
  "$defs", "definitions", "properties", "items", "prefixItems", "allOf", "anyOf", "oneOf",
  "additionalProperties", "patternProperties",
]);

function plain(code: string): Expr {
  return { code, deferred: false };
}

function propertyKey(key: string): string {
  // A literal `__proto__` key would set the prototype instead of defining a property.
  if (key === "__proto__") return '["__proto__"]';
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

/** Prefers unicode-aware regexes, as JSON Schema patterns are ECMA-262 with Unicode semantics. */
export function regexLiteral(pattern: string): string | null {
  for (const flags of ["u", ""]) {
    try {
      new RegExp(pattern, flags);
      return flags ? `new RegExp(${JSON.stringify(pattern)}, "u")` : `new RegExp(${JSON.stringify(pattern)})`;
    } catch {
      // Try the next flag set.
    }
  }
  return null;
}

class ZodCodeGenerator {
  private readonly named = new Map<string, NamedSchema>();
  private readonly usedNames = new Set<string>();
  private readonly diagnostics: Diagnostic[] = [];
  private readonly unmappedFormats = new Map<string, string[]>();
  private currentPointer = "#";
  private currentGroup = new Set<string>();

  constructor(
    private readonly root: JsonObject,
    private readonly rootName: string,
    private readonly options: ZodOptions,
  ) {}

  generate(): { source: string; diagnostics: Diagnostic[] } {
    this.collectNamedSchemas();
    const blocks: string[] = [];

    for (const group of this.orderByDependencies()) {
      const members = group.map((pointer) => this.named.get(pointer)!).sort((a, b) => a.order - b.order);
      const groupSet = new Set(group);
      for (const member of members) blocks.push(this.emitNamed(member, groupSet));
    }

    this.reportUnsupported();
    return { source: `import { z } from "zod";\n\n${blocks.join("\n\n")}\n`, diagnostics: this.diagnostics };
  }

  // ---------------------------------------------------------------------------
  // Naming and dependency ordering
  // ---------------------------------------------------------------------------

  private register(pointer: string, baseName: string, node: SchemaNode): void {
    if (this.named.has(pointer)) return;
    const base = baseName || "Schema";
    let typeName = base;
    for (let suffix = 2; this.usedNames.has(typeName) || this.usedNames.has(`${typeName}Schema`); suffix += 1) {
      typeName = `${base}${suffix}`;
    }
    const constName = `${typeName}Schema`;
    this.usedNames.add(typeName);
    this.usedNames.add(constName);
    this.named.set(pointer, { pointer, typeName, constName, node, order: this.named.size });
  }

  private nameFor(node: SchemaNode, fallback: string): string {
    if (this.options.useTitles && isPlainObject(node) && typeof node.title === "string") {
      const fromTitle = toPascalCase(node.title);
      if (fromTitle) return fromTitle;
    }
    return toPascalCase(fallback);
  }

  private collectNamedSchemas(): void {
    this.register("#", this.rootName, this.root);

    for (const keyword of DEFINITION_KEYWORDS) {
      const definitions = this.root[keyword];
      if (!isPlainObject(definitions)) continue;
      for (const [key, node] of Object.entries(definitions)) {
        if (isSchemaNode(node)) this.register(joinPointer("#", keyword, key), this.nameFor(node, key), node);
      }
    }

    // Any other schema location that is the target of a `$ref` also becomes a named schema.
    walkSchema(this.root, (node) => {
      if (typeof node.$ref !== "string") return;
      const ref = parseRef(node.$ref);
      if (ref.kind !== "local" || !ref.pointer || this.named.has(ref.pointer)) return;
      const target = resolvePointer(this.root as JsonValue, ref.segments);
      if (!isSchemaNode(target)) return;
      const label = [...ref.segments].reverse().find((segment) => !/^\d+$/.test(segment) && !POINTER_KEYWORDS.has(segment));
      this.register(ref.pointer, this.nameFor(target, label ?? "Ref"), target);
    });
  }

  private refTarget(ref: string): string | null {
    const parsed = parseRef(ref);
    return parsed.kind === "local" && parsed.pointer && this.named.has(parsed.pointer) ? parsed.pointer : null;
  }

  private dependenciesOf(named: NamedSchema): Set<string> {
    const dependencies = new Set<string>();
    const visit = (node: SchemaNode, pointer: string, isTop: boolean) => {
      if (!isTop && this.named.has(pointer)) {
        dependencies.add(pointer);
        return;
      }
      if (!isPlainObject(node)) return;
      if (typeof node.$ref === "string") {
        const target = this.refTarget(node.$ref);
        if (target) dependencies.add(target);
      }
      for (const child of getSubschemas(node, pointer)) {
        if (DEFINITION_KEYWORDS.has(child.keyword) || UNSUPPORTED_SET.has(child.keyword)) continue;
        visit(child.node, child.pointer, false);
      }
    };
    visit(named.node, named.pointer, true);
    return dependencies;
  }

  /** Tarjan's algorithm: returns strongly connected groups with dependencies first. */
  private orderByDependencies(): string[][] {
    const graph = new Map<string, Set<string>>();
    for (const named of this.named.values()) graph.set(named.pointer, this.dependenciesOf(named));

    const index = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const groups: string[][] = [];
    let counter = 0;

    const connect = (vertex: string) => {
      index.set(vertex, counter);
      lowLink.set(vertex, counter);
      counter += 1;
      stack.push(vertex);
      onStack.add(vertex);

      for (const next of graph.get(vertex) ?? []) {
        if (!index.has(next)) {
          connect(next);
          lowLink.set(vertex, Math.min(lowLink.get(vertex)!, lowLink.get(next)!));
        } else if (onStack.has(next)) {
          lowLink.set(vertex, Math.min(lowLink.get(vertex)!, index.get(next)!));
        }
      }

      if (lowLink.get(vertex) === index.get(vertex)) {
        const group: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          group.push(member);
        } while (member !== vertex);
        groups.push(group);
      }
    };

    // Visit definitions first so the root schema is emitted last whenever possible.
    const starts = [...this.named.keys()].filter((pointer) => pointer !== "#").concat("#");
    for (const pointer of starts) if (!index.has(pointer)) connect(pointer);
    return groups;
  }

  private emitNamed(named: NamedSchema, group: Set<string>): string {
    this.currentPointer = named.pointer;
    this.currentGroup = group;
    const expr = this.gen(named.node, named.pointer);

    let declaration = `export const ${named.constName} = ${expr.code};`;
    if (expr.deferred) {
      declaration = `export const ${named.constName}: z.ZodType<unknown> = z.lazy(() => ${expr.code});`;
      this.diagnostics.push({
        level: "warning",
        source: "zod",
        message: `${named.typeName} references itself outside an object property, so it is wrapped in z.lazy() and its inferred type is widened to unknown. Runtime validation is unaffected.`,
        path: named.pointer,
      });
    }
    return `${declaration}\nexport type ${named.typeName} = z.infer<typeof ${named.constName}>;`;
  }

  private ref(pointer: string): Expr {
    const target = this.named.get(pointer)!;
    return { code: target.constName, deferred: this.currentGroup.has(pointer) };
  }

  // ---------------------------------------------------------------------------
  // Schema translation
  // ---------------------------------------------------------------------------

  private gen(node: SchemaNode, pointer: string): Expr {
    if (pointer !== this.currentPointer && this.named.has(pointer)) return this.ref(pointer);
    if (node === true) return plain("z.unknown()");
    if (node === false) return plain("z.never()");

    const parts: Expr[] = [];
    if (typeof node.$ref === "string") {
      const target = this.refTarget(node.$ref);
      parts.push(target ? this.ref(target) : plain("z.unknown()"));
    }

    const base = this.genBase(node, pointer);
    if (base) parts.push(base);

    if (Array.isArray(node.anyOf)) parts.push(this.genComposite(node.anyOf, pointer, "anyOf", "z.union"));
    if (Array.isArray(node.oneOf)) parts.push(this.genComposite(node.oneOf, pointer, "oneOf", "z.xor"));
    if (Array.isArray(node.allOf)) {
      node.allOf.forEach((member, index) => {
        if (isSchemaNode(member)) parts.push(this.gen(member, joinPointer(pointer, "allOf", String(index))));
      });
    }

    const expr =
      parts.length === 0
        ? plain("z.unknown()")
        : {
            code: parts[0].code + parts.slice(1).map((part) => `.and(${part.code})`).join(""),
            deferred: parts.some((part) => part.deferred),
          };

    if (node.nullable === true) expr.code += ".nullable()";
    if (typeof node.description === "string") expr.code += `.describe(${JSON.stringify(node.description)})`;
    return expr;
  }

  private genComposite(members: JsonValue[], pointer: string, keyword: string, factory: string): Expr {
    const exprs = members
      .map((member, index) => (isSchemaNode(member) ? this.gen(member, joinPointer(pointer, keyword, String(index))) : null))
      .filter((expr): expr is Expr => expr !== null);
    if (exprs.length === 0) return plain("z.never()");
    if (exprs.length === 1) return exprs[0];
    return {
      code: `${factory}([${exprs.map((expr) => expr.code).join(", ")}])`,
      deferred: exprs.some((expr) => expr.deferred),
    };
  }

  private typesOf(node: JsonObject): string[] {
    if (typeof node.type === "string") return JSON_TYPES.has(node.type) ? [node.type] : [];
    if (Array.isArray(node.type)) {
      return node.type.filter((type): type is string => typeof type === "string" && JSON_TYPES.has(type));
    }
    const has = (keys: string[]) => keys.some((key) => node[key] !== undefined);
    if (has(OBJECT_HINTS)) return ["object"];
    if (has(ARRAY_HINTS)) return ["array"];
    if (has(STRING_HINTS)) return ["string"];
    if (has(NUMBER_HINTS)) return ["number"];
    return [];
  }

  private genBase(node: JsonObject, pointer: string): Expr | null {
    if (node.const !== undefined) return plain(this.genConst(node.const));
    if (Array.isArray(node.enum)) return plain(this.genEnum(node.enum));

    let types = this.typesOf(node);
    if (types.length === 0) return null;
    if (types.includes("number")) types = types.filter((type) => type !== "integer");

    const hasNull = types.includes("null");
    const nonNull = types.filter((type) => type !== "null");
    if (nonNull.length === 0) return plain("z.null()");

    const exprs = nonNull.map((type) => this.genTyped(type, node, pointer));
    const expr: Expr =
      exprs.length === 1
        ? { ...exprs[0] }
        : { code: `z.union([${exprs.map((e) => e.code).join(", ")}])`, deferred: exprs.some((e) => e.deferred) };
    if (hasNull) expr.code += ".nullable()";
    return expr;
  }

  private genTyped(type: string, node: JsonObject, pointer: string): Expr {
    switch (type) {
      case "string":
        return plain(this.genString(node, pointer));
      case "number":
      case "integer":
        return plain(this.genNumber(type, node));
      case "boolean":
        return plain("z.boolean()");
      case "object":
        return this.genObject(node, pointer);
      case "array":
        return this.genArray(node, pointer);
      default:
        return plain("z.unknown()");
    }
  }

  private genString(node: JsonObject, pointer: string): string {
    let code = "z.string()";
    if (typeof node.format === "string") {
      const mapped = ZOD_STRING_FORMATS[node.format];
      if (mapped) code = mapped;
      else this.unmappedFormats.set(node.format, [...(this.unmappedFormats.get(node.format) ?? []), pointer]);
    }
    if (typeof node.minLength === "number") code += `.min(${node.minLength})`;
    if (typeof node.maxLength === "number") code += `.max(${node.maxLength})`;
    if (typeof node.pattern === "string") {
      const regex = regexLiteral(node.pattern);
      if (regex) code += `.regex(${regex})`;
    }
    return code;
  }

  private genNumber(type: string, node: JsonObject): string {
    let code = type === "integer" ? "z.int()" : "z.number()";
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = node;
    // Draft-04 expresses exclusivity as a boolean modifier on minimum/maximum.
    if (typeof minimum === "number") code += exclusiveMinimum === true ? `.gt(${minimum})` : `.min(${minimum})`;
    if (typeof exclusiveMinimum === "number") code += `.gt(${exclusiveMinimum})`;
    if (typeof maximum === "number") code += exclusiveMaximum === true ? `.lt(${maximum})` : `.max(${maximum})`;
    if (typeof exclusiveMaximum === "number") code += `.lt(${exclusiveMaximum})`;
    if (typeof multipleOf === "number") code += `.multipleOf(${multipleOf})`;
    return code;
  }

  private genObject(node: JsonObject, pointer: string): Expr {
    const properties = isPlainObject(node.properties) ? node.properties : {};
    const required = new Set(Array.isArray(node.required) ? node.required.filter((key) => typeof key === "string") : []);
    const entries: string[] = [];
    let deferred = false;

    for (const [key, child] of Object.entries(properties)) {
      if (!isSchemaNode(child)) continue;
      const value = this.gen(child, joinPointer(pointer, "properties", key));
      const code = required.has(key) ? value.code : `${value.code}.optional()`;
      entries.push(value.deferred ? `get ${propertyKey(key)}() { return ${code}; }` : `${propertyKey(key)}: ${code}`);
    }
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) entries.push(`${propertyKey(key)}: z.unknown()`);
    }

    const shape = `{ ${entries.join(", ")} }`;
    const hasShape = entries.length > 0;
    let additional = node.additionalProperties;
    // Pattern properties are not translated, so keep such objects open rather than stripping keys.
    if (additional === undefined && node.patternProperties !== undefined) additional = true;
    const isOpen = additional === true || (isPlainObject(additional) && Object.keys(additional).length === 0);

    let code: string;
    if (additional === false) {
      code = `z.strictObject(${shape})`;
    } else if (additional === undefined) {
      code = hasShape ? `z.object(${shape})` : "z.record(z.string(), z.unknown())";
    } else if (isOpen) {
      code = hasShape ? `z.looseObject(${shape})` : "z.record(z.string(), z.unknown())";
    } else {
      const catchall = this.gen(additional as SchemaNode, joinPointer(pointer, "additionalProperties"));
      deferred ||= catchall.deferred;
      code = hasShape ? `z.object(${shape}).catchall(${catchall.code})` : `z.record(z.string(), ${catchall.code})`;
    }

    if (typeof node.minProperties === "number") {
      code += `.refine((value) => Object.keys(value).length >= ${node.minProperties}, { message: "Expected at least ${node.minProperties} properties" })`;
    }
    if (typeof node.maxProperties === "number") {
      code += `.refine((value) => Object.keys(value).length <= ${node.maxProperties}, { message: "Expected at most ${node.maxProperties} properties" })`;
    }
    return { code, deferred };
  }

  private genArray(node: JsonObject, pointer: string): Expr {
    const minItems = typeof node.minItems === "number" ? node.minItems : undefined;
    const maxItems = typeof node.maxItems === "number" ? node.maxItems : undefined;
    let deferred = false;
    let code: string;

    const tupleKeyword = Array.isArray(node.prefixItems) ? "prefixItems" : Array.isArray(node.items) ? "items" : null;
    if (tupleKeyword) {
      const list = node[tupleKeyword] as JsonValue[];
      const rest = tupleKeyword === "prefixItems" ? node.items : node.additionalItems;
      const elements = list.map((item, index) => {
        const expr = isSchemaNode(item) ? this.gen(item, joinPointer(pointer, tupleKeyword, String(index))) : plain("z.unknown()");
        deferred ||= expr.deferred;
        // JSON Schema tuples allow shorter arrays unless minItems says otherwise.
        return index >= (minItems ?? 0) ? `${expr.code}.optional()` : expr.code;
      });

      let restCode: string | null = "z.unknown()";
      if (rest === false) restCode = null;
      else if (isPlainObject(rest)) {
        const restExpr = this.gen(rest, joinPointer(pointer, tupleKeyword === "prefixItems" ? "items" : "additionalItems"));
        deferred ||= restExpr.deferred;
        restCode = restExpr.code;
      }

      code = restCode ? `z.tuple([${elements.join(", ")}], ${restCode})` : `z.tuple([${elements.join(", ")}])`;
      if (minItems !== undefined && minItems > list.length) {
        code += `.refine((items) => items.length >= ${minItems}, { message: "Expected at least ${minItems} items" })`;
      }
      if (maxItems !== undefined && restCode) {
        code += `.refine((items) => items.length <= ${maxItems}, { message: "Expected at most ${maxItems} items" })`;
      }
    } else {
      const items = isSchemaNode(node.items) ? this.gen(node.items, joinPointer(pointer, "items")) : plain("z.unknown()");
      deferred = items.deferred;
      code = `z.array(${items.code})`;
      if (minItems !== undefined) code += `.min(${minItems})`;
      if (maxItems !== undefined) code += `.max(${maxItems})`;
    }

    if (node.uniqueItems === true) {
      code += `.refine((items) => new Set(items.map((item) => JSON.stringify(item))).size === items.length, { message: "Array items must be unique" })`;
    }
    return { code, deferred };
  }

  private genConst(value: JsonValue): string {
    if (value === null) return "z.null()";
    if (Array.isArray(value)) return `z.tuple([${value.map((item) => this.genConst(item)).join(", ")}])`;
    if (typeof value === "object") {
      const entries = Object.entries(value).map(([key, item]) => `${propertyKey(key)}: ${this.genConst(item)}`);
      return `z.strictObject({ ${entries.join(", ")} })`;
    }
    return `z.literal(${JSON.stringify(value)})`;
  }

  private genEnum(values: JsonValue[]): string {
    if (values.length === 0) return "z.never()";
    if (values.length === 1) return this.genConst(values[0]);
    if (values.every((value) => typeof value === "string")) {
      return `z.enum([${values.map((value) => JSON.stringify(value)).join(", ")}])`;
    }
    if (values.every((value) => value === null || typeof value !== "object")) {
      return `z.literal([${values.map((value) => JSON.stringify(value)).join(", ")}])`;
    }
    return `z.union([${values.map((value) => this.genConst(value)).join(", ")}])`;
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  private reportUnsupported(): void {
    for (const [keyword, paths] of collectKeywordPaths(this.root, ZOD_UNSUPPORTED)) {
      this.diagnostics.push({
        level: "warning",
        source: "zod",
        message: `\`${keyword}\` at ${formatPaths(paths)} is not supported by the Zod generator and was ignored.`,
        path: paths[0],
      });
    }
    for (const [format, paths] of this.unmappedFormats) {
      this.diagnostics.push({
        level: "warning",
        source: "zod",
        message: `String format "${format}" at ${formatPaths(paths)} has no Zod equivalent; it is validated as a plain string.`,
        path: paths[0],
      });
    }
    const annotations = [...collectKeywordPaths(this.root, ANNOTATION_KEYWORDS).keys()];
    if (annotations.length > 0) {
      this.diagnostics.push({
        level: "info",
        source: "zod",
        message: `Annotation keywords (${annotations.join(", ")}) do not affect validation and are not applied to the Zod schema.`,
      });
    }
  }
}

/** Generates unformatted Zod source. Exposed for tests. */
export function generateZodSource(schema: JsonObject, rootName: string, options: ZodOptions) {
  return new ZodCodeGenerator(schema, rootName, options).generate();
}

export async function generateZod(schema: JsonObject, rootName: string, options: ZodOptions): Promise<GeneratedOutput> {
  let generated: { source: string; diagnostics: Diagnostic[] };
  try {
    generated = generateZodSource(schema, rootName, options);
  } catch (error) {
    return {
      code: null,
      diagnostics: [
        {
          level: "error",
          source: "zod",
          message: `Zod generation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  try {
    return { code: await formatTypeScript(generated.source, options.indent), diagnostics: generated.diagnostics };
  } catch (error) {
    return {
      code: generated.source,
      diagnostics: [
        ...generated.diagnostics,
        {
          level: "warning",
          source: "zod",
          message: `Output could not be formatted and is shown as generated: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
