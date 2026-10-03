import { generateTypeScript } from "./json-schema-to-typescript";
import { generateZod } from "./json-schema-to-zod";
import { analyzeSchema } from "./schema-analysis";
import { resolveRootName } from "./schema-utils";
import { parseSchemaText } from "./parse";
import { hasErrors, validateSchemaDocument } from "./schema-validation";
import type { ConversionOptions, ConversionResult } from "./types";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Parses, validates and converts schema text. Pure and side-effect free; safe to run in a worker. */
export async function convertSchema(input: string, options: ConversionOptions): Promise<ConversionResult> {
  const start = now();
  const finish = (result: Omit<ConversionResult, "durationMs">): ConversionResult => ({
    ...result,
    durationMs: Math.round(now() - start),
  });

  const parsed = parseSchemaText(input);
  if (!parsed.ok) {
    return finish({
      valid: false,
      rootName: options.rootName || "Root",
      typescript: null,
      zod: null,
      diagnostics: parsed.diagnostics,
      summary: null,
    });
  }

  const schema = parsed.value;
  const validation = validateSchemaDocument(schema);
  const rootName = resolveRootName(schema, options.rootName, options.useTitles);
  const summary = analyzeSchema(schema, validation.draft);

  if (hasErrors(validation.diagnostics)) {
    return finish({ valid: false, rootName, typescript: null, zod: null, diagnostics: validation.diagnostics, summary });
  }

  const [typescript, zod] = await Promise.all([
    options.mode !== "zod" ? generateTypeScript(schema, rootName, options) : Promise.resolve(null),
    options.mode !== "typescript" ? generateZod(schema, rootName, options) : Promise.resolve(null),
  ]);

  return finish({ valid: true, rootName, typescript, zod, diagnostics: validation.diagnostics, summary });
}
