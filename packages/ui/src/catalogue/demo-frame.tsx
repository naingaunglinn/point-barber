'use client';

import { Checkbox } from '../primitives/checkbox';
import { useId, type ReactNode } from 'react';

// Small parts the demos share (design D12): a labelled switch for a demo's own setting, and the line
// that shows what a handler received — the catalogue has no API, so a demo shows the call instead.

export function DemoToggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

/** The last handler call of a demo, announced politely. */
export function HandlerLog({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <p className="text-sm text-muted-foreground" role="status" data-slot="handler-log">
      <span className="font-semibold">{label}</span> <span>{value}</span>
    </p>
  );
}
