"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ConverterRequest, ConverterResponse } from "@/lib/converters/converter.worker";
import type { ConversionOptions, ConversionResult } from "@/lib/converters/types";

type Pending = { resolve: (result: ConversionResult) => void; reject: (error: Error) => void };

async function convertOnMainThread(input: string, options: ConversionOptions): Promise<ConversionResult> {
  const { convertSchema } = await import("@/lib/converters/convert");
  return convertSchema(input, options);
}

/**
 * Runs conversions in a Web Worker so large schemas never block typing.
 * Falls back to the main thread when workers are unavailable.
 */
export function useSchemaConverter() {
  const workerRef = useRef<Worker | null>(null);
  const workerFailedRef = useRef(false);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextIdRef = useRef(0);

  useEffect(() => {
    const pending = pendingRef.current;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../lib/converters/converter.worker.ts", import.meta.url), { type: "module" });
    } catch {
      workerFailedRef.current = true;
      return;
    }

    worker.onmessage = (event: MessageEvent<ConverterResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new Error(response.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      workerFailedRef.current = true;
      worker?.terminate();
      workerRef.current = null;
      for (const entry of pending.values()) entry.reject(new Error("worker-unavailable"));
      pending.clear();
    };

    workerRef.current = worker;
    return () => {
      worker?.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, []);

  const convert = useCallback(async (input: string, options: ConversionOptions): Promise<ConversionResult> => {
    const worker = workerRef.current;
    if (!worker || workerFailedRef.current) return convertOnMainThread(input, options);

    const id = (nextIdRef.current += 1);
    try {
      return await new Promise<ConversionResult>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        worker.postMessage({ id, input, options } satisfies ConverterRequest);
      });
    } catch (error) {
      if (error instanceof Error && error.message === "worker-unavailable") return convertOnMainThread(input, options);
      throw error;
    }
  }, []);

  return convert;
}
