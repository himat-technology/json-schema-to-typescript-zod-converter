"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useSchemaConverter } from "@/hooks/use-schema-converter";
import { readClipboardText } from "@/lib/browser/clipboard";
import { downloadBlob } from "@/lib/browser/download";
import { readJsonFile } from "@/lib/browser/read-json-file";
import { createZip } from "@/lib/browser/zip";
import { parseSchemaText } from "@/lib/converters/parse";
import { DEFAULT_SAMPLE, SCHEMA_SAMPLES, sampleToText } from "@/lib/converters/samples";
import { toKebabCase } from "@/lib/converters/schema-utils";
import { DEFAULT_OPTIONS, type ConversionOptions, type ConversionResult, type Diagnostic } from "@/lib/converters/types";
import { countLines } from "@/lib/text-stats";
import type { CodeEditorHandle } from "./CodeEditor";
import { ConverterToolbar } from "./ConverterToolbar";
import { DiagnosticsList } from "./DiagnosticsList";
import { InputPanel } from "./InputPanel";
import { OutputPanel } from "./OutputPanel";
import { StatusBadge } from "./Panel";
import { SchemaSummaryBar } from "./SchemaSummaryBar";

const LIVE_DEBOUNCE_MS = 400;

type Notice = { tone: "success" | "error"; message: string };
type OutputTab = "typescript" | "zod";

function requestKey(input: string, options: ConversionOptions): string {
  return `${JSON.stringify(options)}\u0000${input}`;
}

export function JsonSchemaConverter() {
  const convert = useSchemaConverter();
  const editorRef = useRef<CodeEditorHandle>(null);
  const requestIdRef = useRef(0);

  const [input, setInput] = useState(() => sampleToText(DEFAULT_SAMPLE));
  const [sampleId, setSampleId] = useState(DEFAULT_SAMPLE.id);
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS);
  const [live, setLive] = useState(true);
  const [converting, setConverting] = useState(false);
  /** Most recent conversion attempt, valid or not. */
  const [latest, setLatest] = useState<{ key: string; result: ConversionResult } | null>(null);
  /** Most recent successful conversion; kept visible (marked stale) while the input is broken. */
  const [lastGood, setLastGood] = useState<{ key: string; result: ConversionResult } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeTab, setActiveTab] = useState<OutputTab>("typescript");
  const [announcement, setAnnouncement] = useState("");

  const deferredInput = useDeferredValue(input);
  const parsed = useMemo(() => parseSchemaText(deferredInput), [deferredInput]);
  const currentKey = requestKey(input, options);
  const inputEmpty = input.trim() === "";
  const canConvert = !inputEmpty && parsed.ok;

  const showError = useCallback((message: string) => setNotice({ tone: "error", message }), []);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const runConversion = useCallback(
    async (text: string, conversionOptions: ConversionOptions) => {
      const id = (requestIdRef.current += 1);
      setConverting(true);
      try {
        const result = await convert(text, conversionOptions);
        if (id !== requestIdRef.current) return;
        const entry = { key: requestKey(text, conversionOptions), result };
        setLatest(entry);
        if (result.valid) {
          setLastGood(entry);
          const warnings = [...(result.typescript?.diagnostics ?? []), ...(result.zod?.diagnostics ?? []), ...result.diagnostics].filter(
            (diagnostic) => diagnostic.level === "warning",
          ).length;
          setAnnouncement(`Conversion complete in ${result.durationMs} milliseconds${warnings ? ` with ${warnings} warnings` : ""}.`);
        } else {
          setAnnouncement("Conversion stopped: the input has errors.");
        }
      } catch (error) {
        if (id !== requestIdRef.current) return;
        showError(`Conversion failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (id === requestIdRef.current) setConverting(false);
      }
    },
    [convert, showError],
  );

  useEffect(() => {
    if (!live || inputEmpty) return;
    if (latest?.key === requestKey(input, options)) return;
    const timer = setTimeout(() => void runConversion(input, options), LIVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [live, input, options, inputEmpty, latest?.key, runConversion]);

  const handleConvert = useCallback(() => {
    if (canConvert) void runConversion(input, options);
  }, [canConvert, input, options, runConversion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handleConvert();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleConvert]);

  const updateInput = useCallback((value: string, nextSampleId = "custom") => {
    setInput(value);
    setSampleId(nextSampleId);
  }, []);

  const handleSampleChange = (id: string) => {
    const sample = SCHEMA_SAMPLES.find((entry) => entry.id === id);
    if (sample) updateInput(sampleToText(sample, options.indent), sample.id);
  };

  const handleFormat = () => {
    const current = parseSchemaText(input);
    if (!current.ok) {
      showError(current.diagnostics[0]?.message ?? "The input is not valid JSON.");
      return;
    }
    setInput(JSON.stringify(current.value, null, options.indent));
  };

  const handleClear = () => {
    updateInput("");
    setLatest(null);
    setLastGood(null);
    setAnnouncement("Input cleared.");
  };

  const handleReset = () => {
    updateInput(sampleToText(DEFAULT_SAMPLE, options.indent), DEFAULT_SAMPLE.id);
    setNotice({ tone: "success", message: "Restored the default example schema." });
  };

  const handlePaste = async () => {
    try {
      const text = await readClipboardText();
      if (!text.trim()) {
        showError("The clipboard is empty.");
        return;
      }
      updateInput(text);
      setNotice({ tone: "success", message: "Pasted schema from the clipboard." });
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleFile = async (file: File) => {
    try {
      updateInput(await readJsonFile(file));
      setNotice({ tone: "success", message: `Loaded ${file.name}.` });
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

  const output = lastGood?.result ?? null;
  const outputStale = lastGood !== null && lastGood.key !== currentKey;
  const baseName = toKebabCase(output?.rootName ?? "schema") || "schema";
  const tsFileName = `${baseName}.types.ts`;
  const zodFileName = `${baseName}.schema.ts`;
  const tsCode = output?.typescript?.code ?? null;
  const zodCode = output?.zod?.code ?? null;

  const handleDownloadAll = () => {
    if (!tsCode || !zodCode) return;
    const zip = createZip([
      { name: tsFileName, contents: tsCode },
      { name: zodFileName, contents: zodCode },
    ]);
    downloadBlob(new Blob([zip], { type: "application/zip" }), `${baseName}-generated.zip`);
  };

  // Diagnostics always describe the latest attempt; JSON errors appear instantly while typing.
  const latestIsCurrent = latest?.key === currentKey;
  const diagnostics: Diagnostic[] = useMemo(() => {
    if (!parsed.ok && !inputEmpty) return parsed.diagnostics;
    if (!latest) return [];
    const { result } = latest;
    return [...result.diagnostics, ...(result.typescript?.diagnostics ?? []), ...(result.zod?.diagnostics ?? [])];
  }, [parsed, inputEmpty, latest]);

  const schemaErrors = latestIsCurrent && latest !== null && !latest.result.valid;
  let inputBadge;
  if (inputEmpty) inputBadge = <StatusBadge tone="neutral">Empty</StatusBadge>;
  else if (!parsed.ok) inputBadge = <StatusBadge tone="error">{parsed.diagnostics[0]?.source === "json" ? "Invalid JSON" : "Not a schema"}</StatusBadge>;
  else if (schemaErrors) inputBadge = <StatusBadge tone="error">Schema errors</StatusBadge>;
  else if (latestIsCurrent && latest?.result.valid) {
    inputBadge = (
      <StatusBadge tone="success">
        <CheckCircle2 aria-hidden className="size-3" /> Valid schema
      </StatusBadge>
    );
  } else inputBadge = <StatusBadge tone="neutral">Valid JSON</StatusBadge>;

  const showTypescript = options.mode !== "zod";
  const showZod = options.mode !== "typescript";
  const both = showTypescript && showZod;
  const outputHeight = both ? "h-[440px] lg:h-[332px]" : "h-[520px] lg:h-[680px]";
  const pendingMessage = live ? "Output appears as soon as the schema is valid." : "Click Convert or press Ctrl+Enter to generate code.";
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.level === "error").length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.level === "warning").length;

  return (
    <div className="flex flex-col gap-4">
      <ConverterToolbar
        options={options}
        onOptionsChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
        sampleId={sampleId}
        onSampleChange={handleSampleChange}
        rootNamePlaceholder={latest?.result.rootName ?? "Root"}
        live={live}
        onLiveChange={setLive}
        canConvert={canConvert}
        converting={converting}
        onConvert={handleConvert}
        canDownloadAll={Boolean(tsCode && zodCode)}
        onDownloadAll={handleDownloadAll}
      />

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <span className="min-w-0 break-words">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="rounded p-0.5 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <InputPanel
          value={input}
          onChange={(value) => updateInput(value)}
          badge={inputBadge}
          canFormat={parsed.ok && !inputEmpty}
          onFormat={handleFormat}
          onClear={handleClear}
          onReset={handleReset}
          onPaste={handlePaste}
          onFileSelected={handleFile}
          editorHandleRef={editorRef}
          className="h-[520px] lg:h-[680px]"
        />

        <div className="flex min-w-0 flex-col gap-4">
          {both && (
            <div role="tablist" aria-label="Generated output" className="flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 lg:hidden">
              {(["typescript", "zod"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`${tab}-tab`}
                  aria-selected={activeTab === tab}
                  aria-controls={`${tab}-output`}
                  onClick={() => setActiveTab(tab)}
                  className={`h-9 flex-1 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600 ${
                    activeTab === tab ? "bg-white text-brand-700 shadow-sm" : "text-slate-600"
                  }`}
                >
                  {tab === "typescript" ? "TypeScript" : "Zod"}
                </button>
              ))}
            </div>
          )}

          {showTypescript && (
            <div id="typescript-output" className={both && activeTab !== "typescript" ? "max-lg:hidden" : undefined}>
              <OutputPanel
                title="TypeScript types"
                titleId="typescript-output-title"
                output={output?.typescript ?? null}
                fileName={tsFileName}
                emptyMessage={output && !output.typescript ? "Click Convert to generate TypeScript for the current mode." : pendingMessage}
                converting={converting}
                stale={outputStale}
                onError={showError}
                className={outputHeight}
              />
            </div>
          )}
          {showZod && (
            <div id="zod-output" className={both && activeTab !== "zod" ? "max-lg:hidden" : undefined}>
              <OutputPanel
                title="Zod schema"
                titleId="zod-output-title"
                output={output?.zod ?? null}
                fileName={zodFileName}
                emptyMessage={output && !output.zod ? "Click Convert to generate Zod for the current mode." : pendingMessage}
                converting={converting}
                stale={outputStale}
                onError={showError}
                className={outputHeight}
              />
            </div>
          )}
        </div>
      </div>

      {output?.summary && (
        <SchemaSummaryBar
          summary={output.summary}
          outputLines={countLines(tsCode ?? "") + countLines(zodCode ?? "")}
          durationMs={output.durationMs}
        />
      )}

      <section aria-labelledby="diagnostics-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="diagnostics-title" className="text-sm font-semibold text-navy-900">
            Diagnostics
          </h2>
          {errorCount > 0 && <StatusBadge tone="error">{errorCount} {errorCount === 1 ? "error" : "errors"}</StatusBadge>}
          {warningCount > 0 && <StatusBadge tone="warning">{warningCount} {warningCount === 1 ? "warning" : "warnings"}</StatusBadge>}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck aria-hidden className="size-3.5 text-emerald-600" /> Processed locally in your browser
          </span>
        </div>
        {diagnostics.length > 0 ? (
          <DiagnosticsList diagnostics={diagnostics} onJumpToLine={(line, column) => editorRef.current?.focusPosition(line, column)} />
        ) : (
          <p className="text-sm text-slate-500">
            {inputEmpty ? "Paste a JSON Schema, upload a .json file or load a sample to begin." : latest ? "No issues found." : pendingMessage}
          </p>
        )}
      </section>
    </div>
  );
}
