"use client";

import { useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";
import { ClipboardPaste, Eraser, RotateCcw, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { byteSize, countLines, formatBytes } from "@/lib/text-stats";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { Panel } from "./Panel";

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  badge: ReactNode;
  canFormat: boolean;
  onFormat: () => void;
  onClear: () => void;
  onReset: () => void;
  onPaste: () => void;
  onFileSelected: (file: File) => void;
  editorHandleRef: Ref<CodeEditorHandle>;
  className?: string;
}

export function InputPanel({
  value,
  onChange,
  badge,
  canFormat,
  onFormat,
  onClear,
  onReset,
  onPaste,
  onFileSelected,
  editorHandleRef,
  className,
}: InputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  return (
    <Panel
      title="JSON Schema input"
      titleId="schema-input-title"
      badge={badge}
      className={className}
      actions={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,application/schema+json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.target.value = "";
            }}
          />
          <Button size="sm" variant="ghost" icon={<Upload aria-hidden className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
            Upload
          </Button>
          <Button size="sm" variant="ghost" icon={<ClipboardPaste aria-hidden className="size-3.5" />} onClick={onPaste}>
            Paste
          </Button>
          <Button size="sm" variant="ghost" icon={<WandSparkles aria-hidden className="size-3.5" />} onClick={onFormat} disabled={!canFormat}>
            Format
          </Button>
          <Button size="sm" variant="ghost" icon={<Eraser aria-hidden className="size-3.5" />} onClick={onClear} disabled={!value}>
            Clear
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-3.5" />} onClick={onReset} title="Restore the default example">
            Reset
          </Button>
        </>
      }
      footer={
        <>
          <span>{countLines(value)} lines</span>
          <span>{formatBytes(byteSize(value))}</span>
          <span className="hidden sm:inline">Drop a .json file onto the editor to load it</span>
        </>
      }
    >
      <div
        className="h-full"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <CodeEditor
          value={value}
          onChange={onChange}
          language="json"
          label="JSON Schema input"
          placeholder="Paste or type a JSON Schema here…"
          handleRef={editorHandleRef}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-brand-500 bg-brand-50/90 text-sm font-medium text-brand-700">
            Drop your .json schema file
          </div>
        )}
      </div>
    </Panel>
  );
}
