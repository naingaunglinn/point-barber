'use client';

import { Checkbox } from '../primitives/checkbox';
import type { ReactNode } from 'react';

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
  // The whole 44 px row is the touch target (AD-A11Y-05): a click on the label toggles the box.
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </label>
  );
}

/**
 * The last handler call of a demo, announced politely. The live region is always there (so the first call
 * is announced); its text appears only once something happened.
 */
export function HandlerLog({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <p className="text-sm text-muted-foreground" role="status" data-slot="handler-log">
      {value === '' || value === null || value === undefined ? null : (
        <>
          <span className="font-semibold">{label}</span>{' '}
          {/* Values are often JSON without spaces: they may break anywhere. */}
          <span className="wrap-anywhere">{value}</span>
        </>
      )}
    </p>
  );
}
