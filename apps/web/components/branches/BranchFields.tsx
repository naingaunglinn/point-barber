'use client';

import { useId, type ReactNode } from 'react';

import type { BranchCreateBody, BranchUpdateBody } from '@point/shared';
import { FormField, TextInput, fieldErrorOf, useAppForm, useTextField } from '@point/ui';

import type { BranchFormValues } from '../../lib/branches/form-values';

// The parts of the branch form (add-branch-management design D9): its titled sections (AD-FORM-05) and
// a text input bound to one member, under the wrapper `branch-field-<member>` (CG-TEST-06).

export type BranchBody = BranchCreateBody | BranchUpdateBody;
export type BranchForm<B extends BranchBody> = ReturnType<typeof useAppForm<BranchFormValues, B>>;

/** The text inputs of the form, by their member path (`social_links.other.0.url`). */
export type BranchTextName =
  | 'code'
  | 'phone'
  | 'email'
  | 'latitude'
  | 'longitude'
  | 'location_radius_meters'
  | 'map_url'
  | 'website_url'
  | `social_links.${'facebook' | 'tiktok' | 'instagram' | 'youtube' | 'viber'}`
  | `social_links.other.${number}.${'label' | 'url'}`;

/** A titled section of the form (AD-FORM-05 — chunking). */
export function BranchSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

type Keyboard = 'text' | 'email' | 'tel' | 'decimal' | 'numeric' | 'url';

export function BranchTextField<B extends BranchBody>({
  form,
  name,
  label,
  required = false,
  helper,
  inputMode,
  type,
  maxLength,
  message,
}: Readonly<{
  form: BranchForm<B>;
  name: BranchTextName;
  label: string;
  required?: boolean;
  helper?: string;
  inputMode?: Keyboard;
  type?: 'text' | 'email';
  maxLength?: number;
  /** The field's own wording of a code (`already_exists` under *Code*). */
  message?: (code: string) => string | undefined;
}>) {
  const field = useTextField(form, name);
  const error = fieldErrorOf(form.formState.errors, name);
  const worded = error === undefined ? undefined : message?.(error.code);
  const shown = error === undefined || worded === undefined ? error : { ...error, message: worded };
  return (
    <div data-testid={`branch-field-${name}`}>
      <FormField
        label={label}
        required={required}
        {...(helper === undefined ? {} : { helper })}
        error={shown}
      >
        {(control) => (
          <TextInput
            {...control}
            {...field}
            {...(inputMode === undefined ? {} : { inputMode })}
            {...(type === undefined ? {} : { type })}
            {...(maxLength === undefined ? {} : { maxLength })}
          />
        )}
      </FormField>
    </div>
  );
}
