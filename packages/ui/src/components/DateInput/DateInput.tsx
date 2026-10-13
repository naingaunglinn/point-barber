'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ChangeEvent } from 'react';

import {
  businessDateOf,
  formatDate,
  inMmt,
  mmtDate,
  normalizeDigits,
  parseDateInput,
  type BusinessDate,
} from '@point/shared';

import { Calendar } from '../../primitives/calendar';
import { Input } from '../../primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../primitives/popover';
import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';
import { Button } from '../Button/Button';
import { FieldMessage } from '../FormField/FieldMessage';

// A date typed or picked by a person (D-PLT-05 · D-PLT-15 · AD-FORM-15 · design D10): shown as
// `DD/MMM/YYYY`; typed `DD/MM/YYYY` or `DD/MMM/YYYY` (Myanmar digits, any case) is read when the user
// leaves the field; a date that does not exist — or lies outside `min` / `max` — shows
// `error.date_invalid`. The picker works on the Myanmar calendar date and opens on today from the
// supplied clock, whatever the device's zone and date are. The value is the business date `YYYY-MM-DD`.

export interface DateInputProps {
  readonly value: BusinessDate | null;
  readonly onChange: (value: BusinessDate | null) => void;
  readonly min?: BusinessDate;
  readonly max?: BusinessDate;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly onBlur?: () => void;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

const ZONE = 'Asia/Yangon';

function inRange(day: BusinessDate, min?: BusinessDate, max?: BusinessDate): boolean {
  return (min === undefined || day >= min) && (max === undefined || day <= max);
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
  ...control
}: DateInputProps) {
  const t = useTranslations('error');
  const { locale } = useFormat('DateInput');
  const now = useNow();
  const ownId = useId();
  const inputId = control.id ?? `${ownId}-input`;
  const messageId = `${ownId}-message`;
  const shown = value === null ? '' : formatDate(value, { locale });
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const ownMessage = invalid && ariaInvalid === undefined;

  // A value set from outside (a preset, a reset) replaces the text.
  useEffect(() => setText(shown), [shown]);

  const commit = (typed: string) => {
    if (typed.trim() === '') {
      setInvalid(false);
      onChange(null);
      return;
    }
    const day = parseDateInput(typed);
    if (day === 'date_invalid' || !inRange(day, min, max)) {
      setInvalid(true);
      onChange(null);
      return;
    }
    setInvalid(false);
    setText(formatDate(day, { locale }));
    onChange(day);
  };

  const today = inMmt(now);
  const selected = value === null ? undefined : mmtDate(value);
  const described =
    [describedBy, ownMessage ? messageId : null].filter(Boolean).join(' ') || undefined;
  // The calendar button is named by the field's label (FormField gives it `<id>-label`), else like the input.
  const buttonName =
    control['aria-label'] === undefined
      ? { 'aria-labelledby': `${inputId}-label` as const }
      : { 'aria-label': control['aria-label'] };

  return (
    <div className="flex flex-col gap-1" data-slot="date-input">
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2">
          <Input
            {...control}
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            disabled={disabled}
            aria-invalid={ariaInvalid ?? (ownMessage || undefined)}
            aria-describedby={described}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setInvalid(false);
              setText(normalizeDigits(event.target.value));
            }}
            onBlur={() => {
              commit(text);
              onBlur?.();
            }}
            className="h-12 flex-1 font-numeric text-base md:h-10"
          />
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              iconOnly
              icon={<CalendarDays />}
              disabled={disabled}
              aria-haspopup="dialog"
              {...buttonName}
            />
          </PopoverTrigger>
        </div>
        <PopoverContent align="end" className="w-auto max-w-[100vw] p-1.5" data-slot="date-picker">
          <Calendar
            mode="single"
            timeZone={ZONE}
            today={today}
            selected={selected}
            defaultMonth={selected ?? today}
            weekStartsOn={1}
            disabled={[
              ...(min === undefined ? [] : [{ before: mmtDate(min) }]),
              ...(max === undefined ? [] : [{ after: mmtDate(max) }]),
            ]}
            onSelect={(date) => {
              if (date === undefined) return;
              const day = businessDateOf(date);
              setInvalid(false);
              setText(formatDate(day, { locale }));
              onChange(day);
              setOpen(false);
            }}
            className="[--cell-size:--spacing(11)]"
          />
        </PopoverContent>
      </Popover>
      {ownMessage ? <FieldMessage id={messageId}>{t('date_invalid')}</FieldMessage> : null}
    </div>
  );
}
