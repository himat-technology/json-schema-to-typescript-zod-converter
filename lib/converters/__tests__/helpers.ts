import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as zod from "zod";

const TMP_ROOT = path.resolve(__dirname, "../../../.test-output");

/** Type-checks generated sources with `strict` TypeScript and returns readable errors. */
export function typeCheck(files: Record<string, string>): string[] {
  mkdirSync(TMP_ROOT, { recursive: true });
  const dir = mkdtempSync(path.join(TMP_ROOT, "check-"));
  try {
    const fileNames = Object.entries(files).map(([name, contents]) => {
      const fileName = path.join(dir, name);
      writeFileSync(fileName, contents);
      return fileName;
    });
    const program = ts.createProgram(fileNames, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      noUnusedLocals: false,
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      if (!diagnostic.file || diagnostic.start === undefined) return message;
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${path.basename(diagnostic.file.fileName)}:${line + 1} ${message}`;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Loads generated Zod code as a module so its schemas can validate real payloads. */
export function loadZodModule(code: string): Record<string, zod.ZodType> {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const moduleExports: Record<string, zod.ZodType> = {};
  const requireShim = (id: string) => {
    if (id === "zod") return zod;
    throw new Error(`Unexpected import: ${id}`);
  };
  new Function("require", "exports", outputText)(requireShim, moduleExports);
  return moduleExports;
}
