/// <reference lib="webworker" />
import type { ConversionOptions, ConversionResult } from "./types";

export interface ConverterRequest {
  id: number;
  input: string;
  options: ConversionOptions;
}

export type ConverterResponse =
  | { id: number; ok: true; result: ConversionResult }
  | { id: number; ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

// Some converter dependencies read `process` at import time; workers do not define it.
const globalScope = globalThis as unknown as { process?: { env: Record<string, string>; cwd: () => string } };
globalScope.process ??= { env: {}, cwd: () => "/" };

const converterModule = import("./convert");

self.onmessage = async (event: MessageEvent<ConverterRequest>) => {
  const { id, input, options } = event.data;
  try {
    const { convertSchema } = await converterModule;
    const result = await convertSchema(input, options);
    self.postMessage({ id, ok: true, result } satisfies ConverterResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ConverterResponse);
  }
};
