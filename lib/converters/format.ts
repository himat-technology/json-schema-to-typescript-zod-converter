import * as prettier from "prettier/standalone";
import * as estreePlugin from "prettier/plugins/estree";
import * as typescriptPlugin from "prettier/plugins/typescript";
import type { IndentSize } from "./types";

export async function formatTypeScript(code: string, indent: IndentSize): Promise<string> {
  return prettier.format(code, {
    parser: "typescript",
    plugins: [estreePlugin, typescriptPlugin],
    tabWidth: indent,
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
  });
}
