'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type FocusEvent } from 'react';

import { TextInput } from '../TextInput/TextInput';
import { FieldMessage } from '../FormField/FieldMessage';

// A master name as a Myanmar and English pair (D-DB-04 · AD-FORM-09 · AD-FORM-13 · design D10): Myanmar
// first and required, English second and optional — empty English is reported as `null`, and the
// English screens then show the Myanmar text. Both inputs convert Zawgyi on blur (TextInput). Leaving
// the pair with an empty Myanmar name shows `error.required` under the Myanmar input, unless the form
// already marks the field.

export interface Bilingual {
  readonly mm: string;
  readonly en: string | null;
}

export interface BilingualInputProps {
  readonly value: Bilingual;
  readonly onChange: (value: Bilingual) => void;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly disabled?: boolean;
  /** From FormField: these go to the Myanmar input, the required one. */
  readonly id?: string;
  readonly onBlur?: () => void;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

const REQUIRED_MARK = '*';

export function BilingualInput({
  value,
  onChange,
  multiline,
  maxLength,
  disabled,
  id,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
}: BilingualInputProps) {
  const t = useTranslations();
  const ownId = useId();
  const mmId = id ?? `${ownId}-mm`;
  const enId = `${ownId}-en`;
  const messageId = `${ownId}-required`;
  const hintId = `${ownId}-hint`;
  const [missing, setMissing] = useState(false);
  const showMissing = missing && ariaInvalid === undefined;

  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; // still inside the pair
    setMissing(value.mm.trim() === '');
    onBlur?.();
  };

  return (
    <div className="flex flex-col gap-3" data-slot="bilingual-input" onBlur={leave}>
      <div className="flex flex-col gap-1">
        <label htmlFor={mmId} className="text-sm">
          <span>{t('common.bilingual.mm')}</span>
          <span aria-hidden className="ms-1 text-destructive">
            {REQUIRED_MARK}
          </span>
        </label>
        <TextInput
          id={mmId}
          lang="my"
          value={value.mm}
          multiline={multiline}
          maxLength={maxLength}
          disabled={disabled}
          aria-required
          aria-invalid={ariaInvalid ?? (showMissing || undefined)}
          aria-describedby={[describedBy, showMissing ? messageId : null, hintId]
            .filter(Boolean)
            .join(' ')}
          onChange={(mm) => {
            if (mm.trim() !== '') setMissing(false);
            onChange({ mm, en: value.en });
          }}
        />
        {showMissing ? <FieldMessage id={messageId}>{t('error.required')}</FieldMessage> : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={enId} className="text-sm">
          {t('common.bilingual.en')}
        </label>
        <TextInput
          id={enId}
          lang="en"
          value={value.en ?? ''}
          multiline={multiline}
          maxLength={maxLength}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(en) => onChange({ mm: value.mm, en: en.trim() === '' ? null : en })}
        />
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t('common.bilingual.hint')}
      </p>
    </div>
  );
}
