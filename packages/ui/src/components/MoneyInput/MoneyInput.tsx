'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react';

import {
  formatLakh,
  groupDigits,
  moneyUnit,
  normalizeDigits,
  parseMoneyInput,
  type Mmk,
} from '@point/shared';

import { Input } from '../../primitives/input';
import { useFormat } from '../../providers/format';
import { FieldMessage } from '../FormField/FieldMessage';

// Money typed by a person (D-PLT-04 · AD-FORM-11 · AD-FMT-10 · design D10): whole MMK only, the numeric
// keypad, separators while typing, the unit of the language and profile as a suffix. The decimal-point
// and the minus key are ignored (later digits are appended: `7000` `.` `5` `0` → `700,050`); a pasted
// decimal is refused as a whole with `error.amount_invalid`. Empty is `null`, not 0. In the Myanmar UI
// an amount of 1 သိန်း or more shows its size in သိန်း under the field.

export interface MoneyInputProps {
  readonly value: Mmk | null;
  readonly onChange: (value: Mmk | null) => void;
  /** A digit that would pass `max` is not taken. */
  readonly max?: Mmk;
  /** The သိန်း helper of the Myanmar UI (default true; the owner may drop it — AD-FORM-11). */
  readonly lakhHelper?: boolean;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  /** Shown while empty (the price grid: `—` or the inherited shop price). */
  readonly placeholder?: string;
  readonly title?: string;
  readonly id?: string;
  readonly name?: string;
  readonly onBlur?: () => void;
  readonly 'aria-label'?: string;
  /** Labels the field by a visible element elsewhere (a heading) instead of `aria-label`. */
  readonly 'aria-labelledby'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

/** Digits of a text before a position, to put the caret back after the separators move. */
function digitsBefore(text: string, position: number): number {
  return normalizeDigits(text.slice(0, position)).replace(/\D/g, '').length;
}

function positionAfterDigits(text: string, digits: number): number {
  if (digits === 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text.charAt(i))) seen += 1;
    if (seen === digits) return i + 1;
  }
  return text.length;
}

export function MoneyInput({
  value,
  onChange,
  max,
  lakhHelper = true,
  readOnly = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
  ...control
}: MoneyInputProps) {
  const t = useTranslations();
  const { locale, profile } = useFormat('MoneyInput');
  const messageId = useId();
  const helperId = useId();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [refused, setRefused] = useState(false);
  const text = value === null ? '' : groupDigits(value);

  useLayoutEffect(() => {
    if (caret.current === null || input.current === null) return;
    const position = positionAfterDigits(text, caret.current);
    input.current.setSelectionRange(position, position);
    caret.current = null;
  }, [text]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRefused(false);
    const typed = event.target.value;
    const digits = normalizeDigits(typed).replace(/\D/g, '');
    const next = parseMoneyInput(digits);
    if (next === 'amount_invalid') return; // digits only cannot fail; kept for the type
    if (next !== null && max !== undefined && next > max) return;
    caret.current = digitsBefore(typed, event.target.selectionStart ?? typed.length);
    onChange(next);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (parseMoneyInput(event.clipboardData.getData('text')) !== 'amount_invalid') return;
    event.preventDefault();
    setRefused(true);
  };

  const lakh = locale === 'my' && lakhHelper && value !== null ? formatLakh(value) : null;
  const described = [describedBy, refused ? messageId : null, lakh === null ? null : helperId]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1" data-slot="money-input">
      <div className="relative flex items-center">
        <Input
          {...control}
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          readOnly={readOnly}
          aria-invalid={ariaInvalid ?? (refused || undefined)}
          aria-describedby={described === '' ? undefined : described}
          onChange={handleChange}
          onPaste={handlePaste}
          className={cn('h-12 pe-16 text-end font-numeric text-base md:h-10')}
        />
        <span aria-hidden className="pointer-events-none absolute end-3 text-muted-foreground">
          {moneyUnit(locale, profile)}
        </span>
      </div>
      {refused ? <FieldMessage id={messageId}>{t('error.amount_invalid')}</FieldMessage> : null}
      {lakh === null ? null : (
        <p
          id={helperId}
          lang="my"
          data-slot="lakh-helper"
          className="text-sm text-muted-foreground"
        >
          {`${lakh} ${t('common.format.unit.lakh')}`}
        </p>
      )}
    </div>
  );
}
