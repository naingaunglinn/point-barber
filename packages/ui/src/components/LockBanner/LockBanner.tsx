'use client';

import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';
import type { Action } from '../types';

// A locked record (AD-DET-03 · AD-STATE-06 · AD-PERM-02 · design D10): the banner states the locked
// state with who and when (the caller's translated sentence), and the correction path; the correction
// action shows only when the user may take it. The form below shows values as text (ReadOnlyFields),
// not disabled inputs.

export interface LockBannerProps {
  /** Translated: "04/Oct/2026 at Point 3.0 was closed by Ma Hnin at 9:05 PM". */
  readonly message: string;
  /** Translated correction path ("An admin can reopen the day") and its action, when allowed. */
  readonly correction?: { readonly text: string; readonly action?: Action };
}

export function LockBanner({ message, correction }: LockBannerProps) {
  const action = correction?.action;
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-muted p-3"
      data-slot="lock-banner"
    >
      <Lock aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">{message}</p>
        {correction === undefined ? null : <p className="text-sm">{correction.text}</p>}
      </div>
      {action === undefined || action.allowed === false ? null : (
        <Button variant={action.destructive ? 'destructive' : 'primary'} onClick={action.onPress}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export interface ReadOnlyField {
  /** Translated label. */
  readonly label: string;
  /** A formatted value: text through DataText, or a MoneyText / DateText / StatusBadge. */
  readonly value: ReactNode;
}

/** The fields of a locked form as text (AD-DET-03: inputs are replaced by text, not disabled). */
export function ReadOnlyFields({ fields }: Readonly<{ fields: readonly ReadOnlyField[] }>) {
  return (
    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2" data-slot="read-only-fields">
      {fields.map((field) => (
        <div key={field.label} className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{field.label}</dt>
          <dd className="font-semibold">
            {typeof field.value === 'string' ? <DataText>{field.value}</DataText> : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
