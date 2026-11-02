'use client';

import { type BusinessDate, formatTime, mmtInstant } from '@point/shared';
import { DateInput } from '@point/ui';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

// One time of a late entry (AD-POS-14 · AD-FORM-15 · add-late-entry design D6 · task 4.1): a date
// (`DateInput`, opening on today) and a time of day in 5-minute steps, shown 12-hour ("3:35 PM" —
// D-PLT-05). Empty by default; the value is the instant in Myanmar time (`mmtInstant`) once both are
// chosen, null otherwise. The error of the field — required, or the order of the times — sits under it.
// The time is a native select until the shared select component of #18 exists (as the payment-method
// radio of PaymentSheet).

export interface LateEntryTimeFieldProps {
  readonly label: string;
  readonly onChange: (instant: string | null) => void;
  /** The message under the field, or undefined. */
  readonly error?: string;
  readonly 'data-testid'?: string;
}

/** The required asterisk after a label, as FormField shows it. */
const REQUIRED_MARK = '*';

const TIMES = Array.from({ length: (24 * 60) / 5 }, (_, i) => {
  const hours = Math.floor((i * 5) / 60);
  const minutes = (i * 5) % 60;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  // Any day: the label is only the time of day, "3:35 PM" (D-PLT-05 — AM / PM in both languages).
  const label = formatTime(mmtInstant('2026-01-01', value), { locale: 'en' });
  return { value, label };
});

export function LateEntryTimeField({
  label,
  onChange,
  error,
  'data-testid': testId,
}: LateEntryTimeFieldProps) {
  const t = useTranslations('pos.lateEntry');
  const id = useId();
  const [date, setDate] = useState<BusinessDate | null>(null);
  const [time, setTime] = useState('');
  const emit = (nextDate: BusinessDate | null, nextTime: string) =>
    onChange(nextDate === null || nextTime === '' ? null : mmtInstant(nextDate, nextTime));

  return (
    <fieldset
      className="grid gap-1"
      data-testid={testId}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">
        {label}{' '}
        <span data-slot="required-mark" aria-hidden className="ms-1 text-destructive">
          {REQUIRED_MARK}
        </span>
      </legend>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <DateInput
          value={date}
          aria-label={`${label} — ${t('date')}`}
          aria-required
          {...(error ? { 'aria-invalid': true as const } : {})}
          onChange={(next) => {
            setDate(next);
            emit(next, time);
          }}
        />
        <select
          className="h-12 rounded-md border border-input bg-background px-3 text-base md:h-10"
          aria-label={`${label} — ${t('time')}`}
          aria-required
          aria-invalid={error ? true : undefined}
          value={time}
          onChange={(event) => {
            setTime(event.target.value);
            emit(date, event.target.value);
          }}
          data-testid={testId === undefined ? undefined : `${testId}-time`}
        >
          <option value="" />
          {TIMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
