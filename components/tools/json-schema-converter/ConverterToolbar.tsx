"use client";

import { FileArchive, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SCHEMA_SAMPLES } from "@/lib/converters/samples";
import type { ConversionMode, ConversionOptions, IndentSize } from "@/lib/converters/types";

const MODE_OPTIONS: { value: ConversionMode; label: string }[] = [
  { value: "typescript", label: "TypeScript" },
  { value: "zod", label: "Zod" },
  { value: "both", label: "TS + Zod" },
];

const CONVERT_LABELS: Record<ConversionMode, string> = {
  typescript: "Convert to TypeScript",
  zod: "Convert to Zod",
  both: "Convert to both",
};

const fieldClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500/40";

interface ConverterToolbarProps {
  options: ConversionOptions;
  onOptionsChange: (patch: Partial<ConversionOptions>) => void;
  sampleId: string;
  onSampleChange: (sampleId: string) => void;
  rootNamePlaceholder: string;
  live: boolean;
  onLiveChange: (live: boolean) => void;
  canConvert: boolean;
  converting: boolean;
  onConvert: () => void;
  canDownloadAll: boolean;
  onDownloadAll: () => void;
}

export function ConverterToolbar({
  options,
  onOptionsChange,
  sampleId,
  onSampleChange,
  rootNamePlaceholder,
  live,
  onLiveChange,
  canConvert,
  converting,
  onConvert,
  canDownloadAll,
  onDownloadAll,
}: ConverterToolbarProps) {
  return (
    <section aria-label="Conversion options" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto_7rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sample-select" className="text-xs font-medium text-slate-600">
            Sample schema
          </label>
          <select id="sample-select" value={sampleId} onChange={(event) => onSampleChange(event.target.value)} className={fieldClass}>
            {sampleId === "custom" && <option value="custom">Custom input</option>}
            {SCHEMA_SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="root-name" className="text-xs font-medium text-slate-600">
            Root type name
          </label>
          <input
            id="root-name"
            type="text"
            value={options.rootName}
            onChange={(event) => onOptionsChange({ rootName: event.target.value })}
            placeholder={rootNamePlaceholder}
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="root-name-hint"
            className={fieldClass}
          />
          <span id="root-name-hint" className="sr-only">
            Leave empty to use the schema title, or Root when there is no title.
          </span>
        </div>

        <SegmentedControl label="Output" value={options.mode} options={MODE_OPTIONS} onChange={(mode) => onOptionsChange({ mode })} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="indent-select" className="text-xs font-medium text-slate-600">
            Indentation
          </label>
          <select
            id="indent-select"
            value={options.indent}
            onChange={(event) => onOptionsChange({ indent: Number(event.target.value) as IndentSize })}
            className={fieldClass}
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={live} onChange={onLiveChange} description="Convert automatically shortly after you stop typing">
            Live conversion
          </Checkbox>
          <Checkbox
            checked={options.useTitles}
            onChange={(useTitles) => onOptionsChange({ useTitles })}
            description="Name generated types after schema titles where present"
          >
            Use schema titles for names
          </Checkbox>
          <Checkbox
            checked={options.constraintComments}
            onChange={(constraintComments) => onOptionsChange({ constraintComments })}
            description="Document minLength, pattern, format and other constraints as JSDoc tags in TypeScript"
          >
            JSDoc constraint tags
          </Checkbox>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={onDownloadAll}
            disabled={!canDownloadAll}
            icon={<FileArchive aria-hidden className="size-4" />}
            title="Download the TypeScript and Zod files together as a .zip"
          >
            Download both (.zip)
          </Button>
          <Button
            variant="primary"
            onClick={onConvert}
            disabled={!canConvert || converting}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Ctrl+Enter"
            icon={converting ? <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> : <Play aria-hidden className="size-4" />}
          >
            {converting ? "Converting…" : CONVERT_LABELS[options.mode]}
          </Button>
        </div>
      </div>
    </section>
  );
}
