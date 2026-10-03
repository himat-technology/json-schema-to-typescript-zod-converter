"use client";

import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import CodeMirror, { EditorSelection, EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";

export interface CodeEditorHandle {
  /** Moves the cursor to a 1-based line/column and focuses the editor. */
  focusPosition: (line: number, column?: number) => void;
}

interface CodeEditorProps {
  value: string;
  language: "json" | "typescript";
  label: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
  handleRef?: Ref<CodeEditorHandle>;
}

export function CodeEditor({ value, language, label, readOnly = false, placeholder, onChange, handleRef }: CodeEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(handleRef, () => ({
    focusPosition(line, column = 1) {
      const view = editorRef.current?.view;
      if (!view) return;
      const lineInfo = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      const position = Math.min(lineInfo.from + Math.max(column - 1, 0), lineInfo.to);
      view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true });
      view.focus();
    },
  }));

  const extensions = useMemo(
    () => [
      language === "json" ? json() : javascript({ typescript: true }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
    ],
    [language, label],
  );

  return (
    <div className="code-editor h-full min-h-0 overflow-hidden">
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        theme="light"
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={onChange}
        indentWithTab={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: false,
          searchKeymap: true,
          tabSize: 2,
        }}
        className="h-full"
      />
    </div>
  );
}
