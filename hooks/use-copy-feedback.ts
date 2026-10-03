"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/browser/clipboard";

type CopyState = "idle" | "copied" | "error";

/** Copies text and exposes a short-lived "copied" or "error" state for button feedback. */
export function useCopyFeedback(onError: (message: string) => void) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(
    async (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        await copyText(text);
        setState("copied");
      } catch (error) {
        setState("error");
        onError(error instanceof Error ? error.message : String(error));
      }
      timerRef.current = setTimeout(() => setState("idle"), 2000);
    },
    [onError],
  );

  return { state, copy };
}
