'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { formatPhone, normalizeDigits, normalizePhone, type E164 } from '@point/shared';

import { Input } from '../../primitives/input';
import { FieldMessage } from '../FormField/FieldMessage';

// A phone number typed by a person (AD-FORM-10 · FE-CMP-06 · D-CUS-02 · AD-FMT-10 · design D10): the
// field keeps what was typed (only ၀–၉ become 0–9), the grouped number is previewed under it once it is
// valid, and every change reports `{ raw, e164 }` — `e164` null until valid. A non-empty invalid number
// shows `error.phone_invalid` on blur, unless the form already marks the field. `onComplete` runs once
// for each valid number (the customer lookup of AD-FORM-10): a Myanmar number is valid from 7 to 9
// digits after 09, so "complete" is a valid number the user stopped typing (500 ms) or left.

export interface PhoneValue {
  readonly raw: string;
  readonly e164: E164 | null;
}

export interface PhoneInputProps {
  /** The text as typed. */
  readonly value: string;
  readonly onChange: (value: PhoneValue) => void;
  readonly onComplete?: (e164: E164) => void;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly onBlur?: () => void;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

/** A format hint, the same in both languages (the brief), not words. */
const PLACEHOLDER = '09 xxx xxx xxx';

const PAUSE_MS = 500;

function e164Of(raw: string): E164 | null {
  const result = normalizePhone(raw);
  return result === 'phone_invalid' ? null : result;
}

export function PhoneInput({
  value,
  onChange,
  onComplete,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
  ...control
}: PhoneInputProps) {
  const t = useTranslations('error');
  const messageId = useId();
  const previewId = useId();
  const [invalidOnBlur, setInvalidOnBlur] = useState(false);
  const completed = useRef<E164 | null>(null);
  const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const e164 = e164Of(value);
  const ownMessage = invalidOnBlur && ariaInvalid === undefined;

  const complete = (number: E164 | null) => {
    clearTimeout(pause.current);
    if (number === null || number === completed.current) return;
    completed.current = number;
    onComplete?.(number);
  };

  useEffect(() => () => clearTimeout(pause.current), []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeDigits(event.target.value);
    const next = e164Of(raw);
    setInvalidOnBlur(false);
    onChange({ raw, e164: next });
    clearTimeout(pause.current);
    if (next === null) completed.current = null;
    else pause.current = setTimeout(() => complete(next), PAUSE_MS);
  };

  const described = [describedBy, ownMessage ? messageId : null, e164 === null ? null : previewId]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1" data-slot="phone-input">
      <Input
        {...control}
        type="text"
        inputMode="tel"
        autoComplete="tel"
        placeholder={PLACEHOLDER}
        value={value}
        aria-invalid={ariaInvalid ?? (ownMessage || undefined)}
        aria-describedby={described === '' ? undefined : described}
        onChange={handleChange}
        onBlur={() => {
          setInvalidOnBlur(value.trim() !== '' && e164 === null);
          complete(e164);
          onBlur?.();
        }}
        className="h-12 font-numeric text-base md:h-10"
      />
      {ownMessage ? <FieldMessage id={messageId}>{t('phone_invalid')}</FieldMessage> : null}
      {e164 === null ? null : (
        <p
          id={previewId}
          data-slot="phone-preview"
          className="font-numeric text-sm text-muted-foreground"
        >
          {formatPhone(e164)}
        </p>
      )}
    </div>
  );
}
