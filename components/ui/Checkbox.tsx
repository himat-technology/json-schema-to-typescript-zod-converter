import type { ReactNode } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  description?: string;
}

export function Checkbox({ checked, onChange, children, description }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700" title={description}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 cursor-pointer rounded border-slate-300 accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      />
      <span>{children}</span>
    </label>
  );
}
