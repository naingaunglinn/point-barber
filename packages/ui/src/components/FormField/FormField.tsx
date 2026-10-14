'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

import { errorMessageKey } from '@point/shared';
import { FieldMessage } from './FieldMessage';

// One field of a form (D-UI-01 · AD-FORM-01 · AD-FORM-02 · AD-FORM-05 · AD-A11Y-04 · design D10): the
// label above the control, a `--destructive` asterisk right after the label of a required field, and
// the message of `error.<code>` directly under the control, linked by `aria-describedby`. The control's
// border is `--field-border`; an invalid control keeps a `--destructive` outline (the primitives).
// The label's id is `<control id>-label`, so a control's own button can be named by it.

/** A message code: a catalogue code, `too_small` / `too_big` / `invalid_type`, or a client-only key. */
export interface FieldError {
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** What the control receives: spread it on the input. */
export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-invalid': true | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-required': true | undefined;
}

export interface FormFieldProps {
  /** Translated label text. */
  readonly label: string;
  readonly required?: boolean;
  /** Translated helper text, shown under the message. */
  readonly helper?: string;
  readonly error?: FieldError;
  readonly children: (control: FieldControlProps) => ReactNode;
}

const REQUIRED_MARK = '*';

export function FormField({ label, required = false, helper, error, children }: FormFieldProps) {
  const t = useTranslations();
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5" data-slot="form-field">
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-semibold">
        <span>{label}</span>
        {required ? (
          <span data-slot="required-mark" aria-hidden className="ms-1 text-destructive">
            {REQUIRED_MARK}
          </span>
        ) : null}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-required': required || undefined,
      })}
      {error ? (
        <FieldMessage id={errorId}>{t(errorMessageKey(error.code), error.params)}</FieldMessage>
      ) : null}
      {helper ? (
        <p id={helperId} className="text-sm text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
