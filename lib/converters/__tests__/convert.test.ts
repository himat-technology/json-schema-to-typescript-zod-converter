import { describe, expect, it } from "vitest";
import { convertSchema } from "../convert";
import { SCHEMA_SAMPLES, sampleToText } from "../samples";
import { DEFAULT_OPTIONS, type ConversionOptions, type ConversionResult, type JsonObject } from "../types";
import { loadZodModule, typeCheck } from "./helpers";

async function convert(schema: JsonObject | string, overrides: Partial<ConversionOptions> = {}): Promise<ConversionResult> {
  const text = typeof schema === "string" ? schema : JSON.stringify(schema, null, 2);
  return convertSchema(text, { ...DEFAULT_OPTIONS, ...overrides });
}

function errorsOf(result: ConversionResult): string[] {
  return [
    ...result.diagnostics,
    ...(result.typescript?.diagnostics ?? []),
    ...(result.zod?.diagnostics ?? []),
  ]
    .filter((diagnostic) => diagnostic.level === "error")
    .map((diagnostic) => diagnostic.message);
}

function allMessages(result: ConversionResult): string {
  return [...result.diagnostics, ...(result.typescript?.diagnostics ?? []), ...(result.zod?.diagnostics ?? [])]
    .map((diagnostic) => `${diagnostic.level}:${diagnostic.source}:${diagnostic.message}`)
    .join("\n");
}

function expectCompiles(result: ConversionResult) {
  expect(result.typescript?.code).toBeTruthy();
  expect(result.zod?.code).toBeTruthy();
  expect(typeCheck({ "types.ts": result.typescript!.code!, "schema.ts": result.zod!.code! })).toEqual([]);
}

describe("sample schemas", () => {
  it.each(SCHEMA_SAMPLES.map((sample) => [sample.id, sample] as const))(
    "%s converts to valid, type-checking TypeScript and Zod",
    async (_id, sample) => {
      const result = await convert(sampleToText(sample));
      expect(result.valid).toBe(true);
      expect(errorsOf(result)).toEqual([]);
      expectCompiles(result);
    },
  );
});

describe("user schema", () => {
  const sample = SCHEMA_SAMPLES.find((entry) => entry.id === "user")!;

  it("maps required and optional properties accurately", async () => {
    const result = await convert(sample.schema);
    const tsCode = result.typescript!.code!;
    expect(result.rootName).toBe("User");
    expect(tsCode).toContain("export interface User {");
    expect(tsCode).toMatch(/\bid: number;/);
    expect(tsCode).toMatch(/\bname: string;/);
    expect(tsCode).toMatch(/\bemail: string;/);
    expect(tsCode).toMatch(/isActive\?: boolean;/);
    expect(tsCode).toContain('roles?: ("admin" | "editor" | "viewer")[];');
    expect(tsCode).toContain("@minLength 2");

    const zodCode = result.zod!.code!;
    expect(zodCode).toContain('import { z } from "zod";');
    expect(zodCode).toContain("export type User = z.infer<typeof UserSchema>;");
    expect(zodCode).toContain("isActive: z.boolean().optional()");
  });

  it("enforces constraints at runtime", async () => {
    const { UserSchema } = loadZodModule((await convert(sample.schema)).zod!.code!);
    expect(UserSchema.safeParse({ id: 1, name: "Ada", email: "ada@example.com" }).success).toBe(true);
    expect(UserSchema.safeParse({ id: 1, name: "Ada", email: "ada@example.com", roles: ["admin"] }).success).toBe(true);
    expect(UserSchema.safeParse({ id: 1, name: "Ada" }).success).toBe(false);
    expect(UserSchema.safeParse({ id: 1, name: "A", email: "ada@example.com" }).success).toBe(false);
    expect(UserSchema.safeParse({ id: 1.5, name: "Ada", email: "ada@example.com" }).success).toBe(false);
    expect(UserSchema.safeParse({ id: 1, name: "Ada", email: "not-an-email" }).success).toBe(false);
    expect(UserSchema.safeParse({ id: 1, name: "Ada", email: "ada@example.com", roles: ["owner"] }).success).toBe(false);
  });
});

describe("runtime behaviour of generated Zod", () => {
  it("handles nullable fields in API responses", async () => {
    const sample = SCHEMA_SAMPLES.find((entry) => entry.id === "api-response")!;
    const { OrdersResponseSchema } = loadZodModule((await convert(sample.schema)).zod!.code!);
    const order = {
      id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      status: "paid",
      total: 10,
      couponCode: null,
      shippedAt: "2026-01-01T10:00:00Z",
      notes: null,
    };
    const page = { page: 1, pageSize: 20, totalItems: 1, nextCursor: null };
    expect(OrdersResponseSchema.safeParse({ data: [order], pagination: page }).success).toBe(true);
    const { couponCode: _omitted, ...withoutCoupon } = order;
    void _omitted;
    expect(OrdersResponseSchema.safeParse({ data: [withoutCoupon], pagination: page }).success).toBe(false);
    expect(OrdersResponseSchema.safeParse({ data: [{ ...order, shippedAt: "yesterday" }], pagination: page }).success).toBe(false);
  });

  it("enforces product constraints, constants and unique items", async () => {
    const sample = SCHEMA_SAMPLES.find((entry) => entry.id === "product")!;
    const { ProductCatalogueSchema } = loadZodModule((await convert(sample.schema)).zod!.code!);
    const product = {
      sku: "ABC-1234",
      name: "Desk",
      price: 99.99,
      tags: ["office"],
      dimensions: { width: 1, height: 2, unit: "cm" },
      metadata: { color: "oak" },
    };
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [product] }).success).toBe(true);
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [] }).success).toBe(false);
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [{ ...product, price: 0 }] }).success).toBe(false);
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [{ ...product, sku: "abc" }] }).success).toBe(false);
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [{ ...product, tags: ["a", "a"] }] }).success).toBe(false);
    expect(
      ProductCatalogueSchema.safeParse({ currency: "USD", products: [{ ...product, dimensions: { width: 1, height: 2, unit: "mm" } }] }).success,
    ).toBe(false);
    expect(ProductCatalogueSchema.safeParse({ currency: "USD", products: [{ ...product, metadata: { a: 1 } }] }).success).toBe(false);
  });

  it("uses exclusive unions for oneOf and literals for enums", async () => {
    const sample = SCHEMA_SAMPLES.find((entry) => entry.id === "enum-union")!;
    const { NotificationSettingsSchema } = loadZodModule((await convert(sample.schema)).zod!.code!);
    const base = { channel: "email", target: { kind: "email", address: "a@b.co" } };
    expect(NotificationSettingsSchema.safeParse(base).success).toBe(true);
    expect(NotificationSettingsSchema.safeParse({ ...base, priority: 4 }).success).toBe(false);
    expect(NotificationSettingsSchema.safeParse({ ...base, version: 3 }).success).toBe(false);
    expect(NotificationSettingsSchema.safeParse({ ...base, target: { kind: "sms", phone: "+4915112345678" } }).success).toBe(true);
    expect(NotificationSettingsSchema.safeParse({ ...base, target: { kind: "fax" } }).success).toBe(false);
    expect(NotificationSettingsSchema.safeParse({ ...base, audit: { createdBy: "me" } }).success).toBe(false);
    expect(
      NotificationSettingsSchema.safeParse({ ...base, audit: { createdBy: "me", createdAt: "2026-01-01T00:00:00Z" } }).success,
    ).toBe(true);
  });

  it("resolves $defs/$ref including recursive definitions", async () => {
    const sample = SCHEMA_SAMPLES.find((entry) => entry.id === "defs-ref")!;
    const result = await convert(sample.schema);
    expect(result.typescript!.code).toContain("children?: Department[];");
    expect(result.zod!.code).toContain("get children()");

    const { OrganizationSchema, DepartmentSchema } = loadZodModule(result.zod!.code!);
    const org = {
      name: "Himat",
      address: { city: "Chennai", country: "IN" },
      owner: { fullName: "Owner" },
      departments: [{ name: "Eng", children: [{ name: "Platform", children: [] }] }],
    };
    expect(OrganizationSchema.safeParse(org).success).toBe(true);
    expect(DepartmentSchema.safeParse({ name: "Eng", children: [{ children: [] }] }).success).toBe(false);
    expect(OrganizationSchema.safeParse({ ...org, address: { city: "Chennai", country: "IND" } }).success).toBe(false);
  });
});

describe("advanced constructs", () => {
  it("handles mutual recursion with getters that type-check", async () => {
    const result = await convert({
      title: "Graph",
      type: "object",
      properties: { root: { $ref: "#/definitions/Node" } },
      definitions: {
        Node: { type: "object", properties: { id: { type: "string" }, edges: { type: "array", items: { $ref: "#/definitions/Edge" } } }, required: ["id"] },
        Edge: { type: "object", properties: { target: { $ref: "#/definitions/Node" }, weight: { type: "number" } }, required: ["target"] },
      },
    });
    expect(errorsOf(result)).toEqual([]);
    expectCompiles(result);
    const { GraphSchema } = loadZodModule(result.zod!.code!);
    expect(GraphSchema.safeParse({ root: { id: "a", edges: [{ target: { id: "b" } }] } }).success).toBe(true);
    expect(GraphSchema.safeParse({ root: { id: "a", edges: [{ target: { edges: [] } }] } }).success).toBe(false);
  });

  it("wraps recursion outside object properties in z.lazy with a warning", async () => {
    const result = await convert({
      title: "JsonValue",
      anyOf: [
        { type: ["string", "number", "boolean", "null"] },
        { type: "array", items: { $ref: "#" } },
        { type: "object", additionalProperties: { $ref: "#" } },
      ],
    });
    expect(errorsOf(result)).toEqual([]);
    expect(result.zod!.code).toContain("z.lazy(");
    expect(allMessages(result)).toMatch(/warning:zod:JsonValue references itself/);
    expectCompiles(result);
    const { JsonValueSchema } = loadZodModule(result.zod!.code!);
    expect(JsonValueSchema.safeParse({ a: [1, "x", { b: null }] }).success).toBe(true);
    expect(JsonValueSchema.safeParse({ a: [undefined] }).success).toBe(false);
  });

  it("supports draft-04 boolean exclusiveMinimum and draft-07 tuples", async () => {
    const draft4 = await convert({
      $schema: "http://json-schema.org/draft-04/schema#",
      type: "object",
      properties: { score: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 10 } },
    });
    expect(errorsOf(draft4)).toEqual([]);
    expect(draft4.summary?.draft).toBe("Draft 4");
    expect(draft4.zod!.code).toContain("z.number().gt(0).max(10)");

    const tuple = await convert({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "array",
      items: [{ type: "string" }, { type: "integer" }],
      additionalItems: false,
      minItems: 1,
    });
    expect(errorsOf(tuple)).toEqual([]);
    expectCompiles(tuple);
    const { RootSchema } = loadZodModule(tuple.zod!.code!);
    expect(RootSchema.safeParse(["a"]).success).toBe(true);
    expect(RootSchema.safeParse(["a", 1]).success).toBe(true);
    expect(RootSchema.safeParse([]).success).toBe(false);
    expect(RootSchema.safeParse(["a", 1, 2]).success).toBe(false);
  });

  it("supports 2020-12 prefixItems with rest items", async () => {
    const result = await convert({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: [{ type: "string" }],
      items: { type: "number" },
    });
    expectCompiles(result);
    const { RootSchema } = loadZodModule(result.zod!.code!);
    expect(RootSchema.safeParse(["a", 1, 2]).success).toBe(true);
    expect(RootSchema.safeParse(["a", "b"]).success).toBe(false);
  });

  it("quotes non-identifier keys and guards __proto__", async () => {
    const result = await convert(
      '{"type":"object","properties":{"content-type":{"type":"string"},"__proto__":{"type":"number"},"2fa":{"type":"boolean"}},"required":["content-type"]}',
    );
    expect(errorsOf(result)).toEqual([]);
    expect(result.zod!.code).toContain('"content-type": z.string()');
    expect(result.zod!.code).toContain('["__proto__"]: z.number().optional()');
    expectCompiles(result);
    const { RootSchema } = loadZodModule(result.zod!.code!);
    expect(RootSchema.safeParse({ "content-type": "json" }).success).toBe(true);
  });

  it("maps additionalProperties to strict, loose and catchall objects", async () => {
    const result = await convert({
      type: "object",
      properties: {
        strict: { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
        loose: { type: "object", properties: { a: { type: "string" } }, additionalProperties: true },
        typed: { type: "object", properties: { a: { type: "string" } }, additionalProperties: { type: "number" } },
        map: { type: "object" },
      },
    });
    const code = result.zod!.code!;
    expect(code).toContain("z.strictObject(");
    expect(code).toContain("z.looseObject(");
    expect(code).toContain(".catchall(z.number())");
    expect(code).toContain("map: z.record(z.string(), z.unknown()).optional()");
    expect(result.typescript!.code).toMatch(/\[k: string\]: unknown/);
    expectCompiles(result);
  });

  it("honours an explicit root name and the useTitles option", async () => {
    const schema = {
      title: "Customer",
      type: "object",
      properties: { address: { title: "PostalAddress", type: "object", properties: { city: { type: "string" } } } },
      $defs: { Tag: { title: "Label", type: "string" } },
    };
    const named = await convert(schema, { rootName: "account record" });
    expect(named.rootName).toBe("AccountRecord");
    expect(named.typescript!.code).toContain("export interface AccountRecord");
    expect(named.zod!.code).toContain("export const AccountRecordSchema");
    expect(named.zod!.code).toContain("export const LabelSchema");

    const untitled = await convert(schema, { useTitles: false });
    expect(untitled.rootName).toBe("Root");
    expect(untitled.zod!.code).toContain("export const TagSchema");
    expect(untitled.typescript!.code).not.toContain("PostalAddress");
  });

  it("respects the conversion mode and indentation", async () => {
    const tsOnly = await convert({ type: "object", properties: { a: { type: "string" } } }, { mode: "typescript", indent: 4 });
    expect(tsOnly.zod).toBeNull();
    expect(tsOnly.typescript!.code).toContain("\n    a?: string;");
    const zodOnly = await convert({ type: "object", properties: { a: { type: "string" } } }, { mode: "zod" });
    expect(zodOnly.typescript).toBeNull();
    expect(zodOnly.zod!.code).toContain("a: z.string().optional()");
  });
});

describe("error handling", () => {
  it("reports invalid JSON with a line and column", async () => {
    const result = await convert('{\n  "type": "object",\n  "properties": {\n    "a": { "type": "string" },\n  }\n}');
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0].source).toBe("json");
    expect(result.diagnostics[0].line).toBe(5);
    expect(result.diagnostics[0].message).toMatch(/line 5/);
  });

  it("rejects empty input and non-object roots", async () => {
    expect((await convert("   ")).diagnostics[0].message).toMatch(/empty/i);
    expect((await convert("[1, 2]")).diagnostics[0].message).toMatch(/root value is an array/);
    expect((await convert("42")).diagnostics[0].message).toMatch(/root value is a number/);
  });

  it("reports invalid JSON Schema structure", async () => {
    const result = await convert({ type: "object", properties: { age: { type: "integr" } }, required: "age" });
    expect(result.valid).toBe(false);
    const messages = errorsOf(result).join("\n");
    expect(messages).toMatch(/\/properties\/age\/type/);
    expect(messages).toMatch(/\/required/);
  });

  it("reports impossible ranges and invalid regexes", async () => {
    const result = await convert({ type: "string", minLength: 5, maxLength: 2, pattern: "([a-z" });
    expect(result.valid).toBe(false);
    expect(errorsOf(result).join("\n")).toMatch(/minLength.*greater than.*maxLength/);
    expect(errorsOf(result).join("\n")).toMatch(/Invalid regular expression/);
  });

  it("reports missing, external and anchor references", async () => {
    const missing = await convert({ type: "object", properties: { a: { $ref: "#/$defs/Nope" } } });
    expect(errorsOf(missing).join("\n")).toMatch(/Missing reference: "#\/\$defs\/Nope"/);

    const external = await convert({ properties: { a: { $ref: "https://example.com/schema.json" } } });
    expect(errorsOf(external).join("\n")).toMatch(/External reference/);

    const anchor = await convert({ properties: { a: { $ref: "#address" } } });
    expect(errorsOf(anchor).join("\n")).toMatch(/Anchor reference/);

    const malformed = await convert({ properties: { a: { $ref: "#/required" } }, required: ["a"] });
    expect(errorsOf(malformed).join("\n")).toMatch(/Malformed reference/);
  });

  it("warns about unknown and unsupported keywords without discarding output", async () => {
    const result = await convert({
      type: "object",
      properties: {
        name: { type: "string", requird: true },
        code: { type: "string", not: { const: "x" } },
        kind: { type: "string", format: "idn-hostname" },
      },
      if: { properties: { name: { const: "a" } } },
      then: { required: ["code"] },
    });
    expect(result.valid).toBe(true);
    const messages = allMessages(result);
    expect(messages).toMatch(/warning:schema:Unknown keyword `requird`/);
    expect(messages).toMatch(/warning:zod:`not` at #\/properties\/code/);
    expect(messages).toMatch(/warning:typescript:`if` at #/);
    expect(messages).toMatch(/warning:zod:String format "idn-hostname"/);
    expectCompiles(result);
  });
});

describe("performance", () => {
  it("converts a large schema quickly", async () => {
    const properties: JsonObject = {};
    for (let index = 0; index < 400; index += 1) {
      properties[`field${index}`] = {
        type: "object",
        properties: {
          id: { type: "integer", minimum: 0 },
          label: { type: "string", maxLength: 50 },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      };
    }
    const started = Date.now();
    const result = await convert({ title: "Big", type: "object", properties });
    expect(result.valid).toBe(true);
    expect(result.summary?.propertyCount).toBe(1600);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(typeCheck({ "types.ts": result.typescript!.code!, "schema.ts": result.zod!.code! })).toEqual([]);
  }, 30_000);
});
