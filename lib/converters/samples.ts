import type { JsonObject } from "./types";

export interface SchemaSample {
  id: string;
  label: string;
  description: string;
  schema: JsonObject;
}

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

export const SCHEMA_SAMPLES: SchemaSample[] = [
  {
    id: "user",
    label: "Simple user",
    description: "Primitives, string formats, required fields and an enum array.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "User",
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string", minLength: 2 },
        email: { type: "string", format: "email" },
        isActive: { type: "boolean" },
        roles: {
          type: "array",
          items: { type: "string", enum: ["admin", "editor", "viewer"] },
        },
      },
      required: ["id", "name", "email"],
    },
  },
  {
    id: "nested",
    label: "Nested objects",
    description: "Objects inside objects, with numeric ranges and strict object shapes.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "CompanyProfile",
      description: "A company with headquarters address and primary contact.",
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        founded: { type: "integer", minimum: 1800, maximum: 2100 },
        headquarters: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            postalCode: { type: "string", pattern: "^[A-Z0-9 -]{3,10}$" },
            geo: {
              type: "object",
              properties: {
                lat: { type: "number", minimum: -90, maximum: 90 },
                lng: { type: "number", minimum: -180, maximum: 180 },
              },
              required: ["lat", "lng"],
              additionalProperties: false,
            },
          },
          required: ["city"],
        },
        contact: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            website: { type: "string", format: "uri" },
          },
        },
      },
      required: ["name", "headquarters"],
    },
  },
  {
    id: "product",
    label: "Product catalogue",
    description: "Catalogue with priced products, tags, variants and a metadata map.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "ProductCatalogue",
      type: "object",
      properties: {
        currency: { type: "string", enum: ["USD", "EUR", "INR", "GBP"] },
        products: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              sku: { type: "string", pattern: "^[A-Z]{3}-\\d{4}$", description: "Stock keeping unit" },
              name: { type: "string", minLength: 1 },
              price: { type: "number", exclusiveMinimum: 0, multipleOf: 0.01 },
              stock: { type: "integer", minimum: 0, default: 0 },
              tags: { type: "array", items: { type: "string" }, uniqueItems: true, maxItems: 10 },
              dimensions: {
                type: "object",
                properties: {
                  width: { type: "number" },
                  height: { type: "number" },
                  unit: { const: "cm" },
                },
                required: ["width", "height", "unit"],
              },
              variants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    color: { type: "string" },
                    size: { type: "string", enum: ["S", "M", "L", "XL"] },
                  },
                  required: ["color"],
                },
              },
              metadata: { type: "object", additionalProperties: { type: "string" } },
            },
            required: ["sku", "name", "price"],
          },
        },
      },
      required: ["currency", "products"],
    },
  },
  {
    id: "api-response",
    label: "API response",
    description: "Paginated response with arrays, nullable fields and timestamps.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "OrdersResponse",
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              status: { type: "string", enum: ["pending", "paid", "shipped", "cancelled"] },
              total: { type: "number", minimum: 0 },
              couponCode: { type: ["string", "null"] },
              shippedAt: { type: ["string", "null"], format: "date-time" },
              notes: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    productId: { type: "string" },
                    quantity: { type: "integer", minimum: 1 },
                  },
                  required: ["productId", "quantity"],
                },
              },
            },
            required: ["id", "status", "total", "couponCode", "shippedAt"],
          },
        },
        pagination: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
            totalItems: { type: "integer", minimum: 0 },
            nextCursor: { type: ["string", "null"] },
          },
          required: ["page", "pageSize", "totalItems", "nextCursor"],
        },
        error: { type: "null" },
      },
      required: ["data", "pagination"],
    },
  },
  {
    id: "enum-union",
    label: "Enums and unions",
    description: "String and numeric enums, constants, anyOf, oneOf and allOf.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "NotificationSettings",
      type: "object",
      properties: {
        channel: { type: "string", enum: ["email", "sms", "push"] },
        priority: { enum: [1, 2, 3] },
        version: { const: 2 },
        target: {
          oneOf: [
            {
              type: "object",
              properties: { kind: { const: "email" }, address: { type: "string", format: "email" } },
              required: ["kind", "address"],
            },
            {
              type: "object",
              properties: { kind: { const: "sms" }, phone: { type: "string", pattern: "^\\+[1-9]\\d{6,14}$" } },
              required: ["kind", "phone"],
            },
          ],
        },
        schedule: {
          anyOf: [{ type: "string", format: "date-time" }, { type: "integer", minimum: 0 }],
        },
        audit: {
          allOf: [
            { type: "object", properties: { createdBy: { type: "string" } }, required: ["createdBy"] },
            { type: "object", properties: { createdAt: { type: "string", format: "date-time" } }, required: ["createdAt"] },
          ],
        },
      },
      required: ["channel", "target"],
    },
  },
  {
    id: "defs-ref",
    label: "$defs and $ref",
    description: "Reusable definitions, shared references and a recursive tree.",
    schema: {
      $schema: DRAFT_2020_12,
      title: "Organization",
      type: "object",
      properties: {
        name: { type: "string" },
        address: { $ref: "#/$defs/Address" },
        billingAddress: { $ref: "#/$defs/Address" },
        owner: { $ref: "#/$defs/Person" },
        departments: { type: "array", items: { $ref: "#/$defs/Department" } },
      },
      required: ["name", "address", "owner"],
      $defs: {
        Address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            country: { type: "string", minLength: 2, maxLength: 2 },
          },
          required: ["city", "country"],
        },
        Person: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            email: { type: "string", format: "email" },
            address: { $ref: "#/$defs/Address" },
          },
          required: ["fullName"],
        },
        Department: {
          description: "Departments can contain sub-departments (recursive).",
          type: "object",
          properties: {
            name: { type: "string" },
            lead: { $ref: "#/$defs/Person" },
            children: { type: "array", items: { $ref: "#/$defs/Department" } },
          },
          required: ["name"],
        },
      },
    },
  },
];

export const DEFAULT_SAMPLE = SCHEMA_SAMPLES[0];

export function sampleToText(sample: SchemaSample, indent: number = 2): string {
  return JSON.stringify(sample.schema, null, indent);
}
