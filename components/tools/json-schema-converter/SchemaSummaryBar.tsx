import type { SchemaSummary } from "@/lib/converters/types";

interface SchemaSummaryBarProps {
  summary: SchemaSummary;
  outputLines: number;
  durationMs: number | null;
}

export function SchemaSummaryBar({ summary, outputLines, durationMs }: SchemaSummaryBarProps) {
  const stats = [
    { label: "Draft", value: summary.draft },
    { label: "Properties", value: summary.propertyCount },
    { label: "Required", value: summary.requiredCount },
    { label: "Object depth", value: `${summary.maxDepth} ${summary.maxDepth === 1 ? "level" : "levels"}` },
    { label: "Definitions", value: summary.definitionCount },
    { label: "$refs", value: summary.refCount },
    { label: "Generated lines", value: outputLines },
    ...(durationMs !== null ? [{ label: "Converted in", value: `${durationMs} ms` }] : []),
  ];

  return (
    <section aria-label="Schema summary" className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-xs text-slate-500">{stat.label}</dt>
            <dd className="truncate text-sm font-semibold text-navy-900">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {summary.types.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>Types used:</span>
          {summary.types.map((type) => (
            <code key={type} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
              {type}
            </code>
          ))}
        </p>
      )}
    </section>
  );
}
