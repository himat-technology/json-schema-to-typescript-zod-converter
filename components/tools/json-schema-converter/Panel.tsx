import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  titleId: string;
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, titleId, badge, actions, footer, children, className = "" }: PanelProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id={titleId} className="truncate text-sm font-semibold text-navy-900">
            {title}
          </h2>
          {badge}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:px-4">
          {footer}
        </footer>
      )}
    </section>
  );
}

type BadgeTone = "success" | "error" | "warning" | "neutral" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/20",
  info: "bg-brand-50 text-brand-700 ring-brand-600/20",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}
