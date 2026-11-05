'use client';

import { useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';

import { type BusinessDate, errorMessageKey, formatTime, mmtInstant } from '@point/shared';
import { ChoiceGroup, DateInput, type FieldError } from '@point/ui';

// The expected end of maintenance (AD-NAV-08 · AD-FORM-15 · D-PLT-05 · add-settings-store design D10 ·
// task 6.1): a date (`DateInput`) and a time of day in 5-minute steps shown 12-hour ("10:00 PM"), the
// shape of the late-entry time field (AD-FORM-14 — 288 times, so the searchable combobox). Both are
// optional; the form asks for the other when one is chosen. Its help says that maintenance stays on until
// it is turned off — `until` is only shown (proposal reading 8).

const TIMES = Array.from({ length: (24 * 60) / 5 }, (_, i) => {
  const hours = Math.floor((i * 5) / 60);
  const minutes = (i * 5) % 60;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  // Any day: the label is only the time of day (AM / PM in both languages — D-PLT-05).
  return { value, label: formatTime(mmtInstant('2026-01-01', value), { locale: 'en' }) };
});

export function UntilField({
  date,
  time,
  onDate,
  onTime,
  error,
}: Readonly<{
  date: BusinessDate | null;
  time: string | null;
  onDate: (date: BusinessDate | null) => void;
  onTime: (time: string) => void;
  error?: FieldError;
}>) {
  const t = useTranslations('maintenance.screen');
  const tAll = useTranslations();
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const label = t('until');
  const times = useMemo(
    () => (
      <ChoiceGroup
        aria-label={`${label} — ${t('until_time')}`}
        options={TIMES.map((option) => ({
          ...option,
          testId: `maintenance-until-time-${option.value}`,
        }))}
        value={time}
        {...(error === undefined ? {} : { invalidBy: errorId })}
        onChange={onTime}
        data-testid="maintenance-until-time"
      />
    ),
    [label, t, time, error, errorId, onTime],
  );
  return (
    <fieldset
      className="grid gap-1"
      data-testid="maintenance-until"
      aria-describedby={[error ? errorId : null, helpId].filter(Boolean).join(' ')}
    >
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <DateInput
          value={date}
          aria-label={`${label} — ${t('until_date')}`}
          {...(error ? { 'aria-invalid': true as const } : {})}
          onChange={onDate}
        />
        {times}
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {tAll(errorMessageKey(error.code), error.params)}
        </p>
      )}
      <p id={helpId} className="text-sm text-muted-foreground">
        {t('until_help')}
      </p>
    </fieldset>
  );
}
