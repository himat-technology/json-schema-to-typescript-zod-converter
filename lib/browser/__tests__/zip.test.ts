import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createZip } from "../zip";

describe("createZip", () => {
  it("produces an archive that standard tools can extract", () => {
    const root = path.resolve(__dirname, "../../../.test-output");
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(path.join(root, "zip-"));
    try {
      const zipPath = path.join(dir, "out.zip");
      writeFileSync(zipPath, createZip([
        { name: "user.types.ts", contents: "export interface User { name: string }\n" },
        { name: "user.schema.ts", contents: 'import { z } from "zod";\n// ünïcödé\n' },
      ]));

      const extractDir = path.join(dir, "extracted");
      // `tar` ships with Windows 10+, macOS and Linux and understands zip archives.
      mkdirSync(extractDir);
      execFileSync("tar", ["-xf", zipPath, "-C", extractDir]);
      expect(readFileSync(path.join(extractDir, "user.types.ts"), "utf8")).toBe("export interface User { name: string }\n");
      expect(readFileSync(path.join(extractDir, "user.schema.ts"), "utf8")).toContain("ünïcödé");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
