"use client";

import { useId, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

/** A radio group styled as a segmented control, with arrow-key navigation. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const labelId = useId();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-medium text-slate-600">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className="inline-flex h-10 rounded-lg border border-slate-300 bg-slate-100 p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ${
                selected ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
