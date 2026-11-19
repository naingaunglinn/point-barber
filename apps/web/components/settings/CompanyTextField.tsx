'use client';

import type { CompanyUpdate } from '@point/shared';
import { FormField, TextInput, fieldErrorOf, type useAppForm, useTextField } from '@point/ui';

import type { CompanyFormInput } from './company-values';

// One text member of the company form (AD-FORM-01 / 02 / 03 · AD-FORM-13): the label above, the message
// of the schema or the API directly under the input, helper text under that; the shared TextInput, so
// Zawgyi typed into it is converted to Unicode when the user leaves it. The input's name is the API
// member (`social_links.facebook`, `social_links.other.0.url`), so the schema's issues and the API's
// `errors[].field` land on it unchanged.

export type CompanyForm = ReturnType<typeof useAppForm<CompanyFormInput, CompanyUpdate>>;

/** A path of the form whose input is text. */
export type CompanyTextPath = Parameters<typeof useTextField<CompanyFormInput, CompanyUpdate>>[1];

export interface CompanyTextFieldProps {
  readonly form: CompanyForm;
  readonly name: CompanyTextPath;
  /** Translated. */
  readonly label: string;
  /** Translated helper text. */
  readonly helper?: string;
  readonly testId: string;
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly lang?: 'my' | 'en';
  readonly type?: 'text' | 'email';
  /** An `http(s)` address: the url keyboard, no capital letter and no correction. */
  readonly link?: boolean;
}

export function CompanyTextField({
  form,
  name,
  label,
  helper,
  testId,
  required,
  multiline,
  lang,
  type,
  link = false,
}: CompanyTextFieldProps) {
  const field = useTextField(form, name);
  return (
    <FormField
      label={label}
      required={required}
      helper={helper}
      error={fieldErrorOf(form.formState.errors, name)}
    >
      {(control) => (
        <TextInput
          {...control}
          {...field}
          data-testid={testId}
          multiline={multiline}
          lang={lang}
          type={type}
          {...(type === 'email' ? { inputMode: 'email' as const, autoComplete: 'email' } : {})}
          {...(link
            ? {
                inputMode: 'url' as const,
                autoCapitalize: 'none' as const,
                autoCorrect: 'off' as const,
              }
            : {})}
        />
      )}
    </FormField>
  );
}
