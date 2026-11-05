'use client';

import { type BusinessDate, formatTime, mmtInstant } from '@point/shared';
import { ChoiceGroup, DateInput } from '@point/ui';
import { useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

// One time of a late entry (AD-POS-14 · AD-FORM-15 · add-late-entry design D6 · task 4.1): a date
// (`DateInput`, opening on today) and a time of day in 5-minute steps, shown 12-hour ("3:35 PM" —
// D-PLT-05). Empty by default; the value is the instant in Myanmar time (`mmtInstant`) once both are
// chosen, null otherwise. The error of the field — required, or the order of the times — sits under it.
// The time is a `ChoiceGroup` (AD-FORM-14 — 288 times, so its searchable combobox), named by the
// field's label and "Time"; its trigger's test id is `<field test id>-time` and each time's
// `<field test id>-time-<HH:mm>`.

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
  const [time, setTime] = useState<string | null>(null);
  const emit = (nextDate: BusinessDate | null, nextTime: string | null) =>
    onChange(nextDate === null || nextTime === null ? null : mmtInstant(nextDate, nextTime));
  // 288 options: the combobox renders again only when its own name, value or test ids change, not on
  // every change of the form around it. A chosen time reaches the latest date and `onChange`.
  const pickTime = useRef<(next: string) => void>(() => undefined);
  useLayoutEffect(() => {
    pickTime.current = (next) => {
      setTime(next);
      emit(date, next);
    };
  });
  const timeName = `${label} — ${t('time')}`;
  // The field's one message marks the time control too: red outline and aria-invalid (AD-FORM-02).
  const invalid = Boolean(error);
  const timeList = useMemo(
    () => (
      <ChoiceGroup
        aria-label={timeName}
        required
        options={
          testId === undefined
            ? TIMES
            : TIMES.map((option) => ({ ...option, testId: `${testId}-time-${option.value}` }))
        }
        value={time}
        {...(invalid ? { invalidBy: `${id}-error` } : {})}
        onChange={(next) => pickTime.current(next)}
        {...(testId === undefined ? {} : { 'data-testid': `${testId}-time` })}
      />
    ),
    [timeName, time, testId, invalid, id],
  );

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
      <div className="grid gap-2">
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
        {timeList}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
