import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { Diagnostic, DiagnosticLevel, DiagnosticSource } from "@/lib/converters/types";

const SOURCE_LABELS: Record<DiagnosticSource, string> = {
  json: "JSON",
  schema: "Schema",
  typescript: "TypeScript",
  zod: "Zod",
};

const LEVEL_STYLES: Record<DiagnosticLevel, { icon: typeof Info; className: string; label: string }> = {
  error: { icon: XCircle, className: "text-red-600", label: "Error" },
  warning: { icon: AlertTriangle, className: "text-amber-600", label: "Warning" },
  info: { icon: Info, className: "text-brand-600", label: "Note" },
};

const LEVEL_ORDER: Record<DiagnosticLevel, number> = { error: 0, warning: 1, info: 2 };

interface DiagnosticsListProps {
  diagnostics: Diagnostic[];
  onJumpToLine?: (line: number, column?: number) => void;
  compact?: boolean;
}

export function DiagnosticsList({ diagnostics, onJumpToLine, compact = false }: DiagnosticsListProps) {
  if (diagnostics.length === 0) return null;
  const sorted = [...diagnostics].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return (
    <ul className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      {sorted.map((diagnostic, index) => {
        const { icon: Icon, className, label } = LEVEL_STYLES[diagnostic.level];
        return (
          <li key={`${diagnostic.source}-${index}`} className="flex gap-2 text-sm leading-snug text-slate-700">
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${className}`} />
            <div className="min-w-0 break-words">
              <span className="sr-only">{label}: </span>
              <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-px text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {SOURCE_LABELS[diagnostic.source]}
              </span>
              {diagnostic.message}
              {diagnostic.line !== undefined && onJumpToLine && (
                <button
                  type="button"
                  onClick={() => onJumpToLine(diagnostic.line!, diagnostic.column)}
                  className="ml-2 rounded text-xs font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  Go to line {diagnostic.line}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
