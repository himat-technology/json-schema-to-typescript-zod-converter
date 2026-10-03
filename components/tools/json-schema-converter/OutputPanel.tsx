"use client";

import { Check, Copy, Download, FileCode2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { downloadTextFile } from "@/lib/browser/download";
import type { GeneratedOutput } from "@/lib/converters/types";
import { byteSize, countLines, formatBytes } from "@/lib/text-stats";
import { CodeEditor } from "./CodeEditor";
import { DiagnosticsList } from "./DiagnosticsList";
import { Panel, StatusBadge } from "./Panel";

interface OutputPanelProps {
  title: string;
  titleId: string;
  output: GeneratedOutput | null;
  fileName: string;
  /** Explains why there is no output, e.g. the mode excludes this target. */
  emptyMessage: string;
  converting: boolean;
  stale: boolean;
  onError: (message: string) => void;
  className?: string;
}

export function OutputPanel({ title, titleId, output, fileName, emptyMessage, converting, stale, onError, className }: OutputPanelProps) {
  const { state: copyState, copy } = useCopyFeedback(onError);
  const code = output?.code ?? null;
  const failed = output !== null && code === null;
  const warningCount = output?.diagnostics.filter((diagnostic) => diagnostic.level === "warning").length ?? 0;

  let badge = null;
  if (converting) {
    badge = (
      <StatusBadge tone="info">
        <Loader2 aria-hidden className="size-3 motion-safe:animate-spin" /> Converting
      </StatusBadge>
    );
  } else if (failed) {
    badge = <StatusBadge tone="error">Failed</StatusBadge>;
  } else if (code && stale) {
    badge = <StatusBadge tone="warning">Out of date</StatusBadge>;
  } else if (code && warningCount > 0) {
    badge = <StatusBadge tone="warning">{warningCount} {warningCount === 1 ? "warning" : "warnings"}</StatusBadge>;
  }

  return (
    <Panel
      title={title}
      titleId={titleId}
      badge={badge}
      className={className}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={!code}
            onClick={() => code && copy(code)}
            icon={copyState === "copied" ? <Check aria-hidden className="size-3.5 text-emerald-600" /> : <Copy aria-hidden className="size-3.5" />}
            aria-label={`Copy ${title}`}
          >
            {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!code}
            onClick={() => code && downloadTextFile(code, fileName, "text/typescript")}
            icon={<Download aria-hidden className="size-3.5" />}
            aria-label={`Download ${fileName}`}
          >
            .ts
          </Button>
        </>
      }
      footer={
        code ? (
          <>
            <span>{countLines(code)} lines</span>
            <span>{formatBytes(byteSize(code))}</span>
            <span className="truncate font-mono">{fileName}</span>
          </>
        ) : undefined
      }
    >
      {code ? (
        <CodeEditor value={code} language="typescript" label={`${title} (read-only)`} readOnly />
      ) : failed ? (
        <div className="h-full overflow-auto p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-red-700">
            <XCircle aria-hidden className="size-4" /> Conversion failed
          </p>
          <DiagnosticsList diagnostics={output.diagnostics.filter((diagnostic) => diagnostic.level === "error")} compact />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <FileCode2 aria-hidden className="size-8 text-slate-300" />
          <p className="max-w-xs text-sm text-slate-500">{emptyMessage}</p>
        </div>
      )}
    </Panel>
  );
}
