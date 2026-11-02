'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { errorMessageKey } from '@point/shared';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../primitives/command';
import { RadioGroup, RadioGroupItem } from '../../primitives/radio-group';
import { DataText } from '../DataText/DataText';
import { FieldMessage } from '../FormField/FieldMessage';
import type { FieldError } from '../FormField/FormField';

// One choice among options (AD-FORM-14 · AD-A11Y-04 · AD-A11Y-05 · AD-VIS-07 · D-UI-01 · design D10): up
// to 7 options a radio group with every option visible, 8 or more a searchable list (AD-FORM-14 "More →
// searchable combobox"). Not the segmented control (AD-CMP-03) nor the big choice buttons (AD-CMP-02).
// Named by a visible label in the FormField label style, or by `aria-label` where a visible title
// already names it (a dialog). Each option, its label text included, is a 44 px row 8 px from the next;
// option text goes through DataText. The radio form is one tab stop with arrow keys (Radix roving
// focus). `required` adds the asterisk; `error` puts the message of `error.<code>` under the options and
// links it with `aria-describedby`. An option's `testId` lands on the element with its role, so a test
// can `check()` it.

export interface ChoiceOption<V extends string = string> {
  readonly value: V;
  /** Translated text, or a data value (a master name) — shown through DataText. */
  readonly label: string;
  /** Set on the `radio` / `option` element, for the screen's tests. */
  readonly testId?: string;
}

interface ChoiceGroupBase<V extends string> {
  readonly options: readonly ChoiceOption<V>[];
  readonly value: V | null;
  readonly onChange: (value: V) => void;
  readonly required?: boolean;
  readonly error?: FieldError;
  /** Set on the group's wrapper. */
  readonly 'data-testid'?: string;
}

/** Exactly one name: a visible `label`, or an `aria-label` when a visible title already names the group. */
export type ChoiceGroupProps<V extends string = string> = ChoiceGroupBase<V> &
  (
    | { readonly label: string; readonly 'aria-label'?: never }
    | { readonly 'aria-label': string; readonly label?: never }
  );

/** AD-FORM-14: ≤ 7 options are a radio group; more are a searchable list. */
export const RADIO_LIMIT = 7;

const REQUIRED_MARK = '*';

/**
 * The list form keeps the options whose label contains the typed text (case-insensitive). cmdk's own
 * fuzzy score would also keep "Customer wants to change" for `Other`.
 */
const byLabel = (_value: string, search: string, keywords?: string[]) =>
  (keywords ?? []).some((label) => label.toLowerCase().includes(search.trim().toLowerCase()))
    ? 1
    : 0;

export function ChoiceGroup<V extends string = string>(props: ChoiceGroupProps<V>) {
  const { options, value, onChange, required = false, error, 'data-testid': testId } = props;
  const t = useTranslations();
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const visibleLabel = props.label;
  const hiddenName = props['aria-label'];
  const named =
    visibleLabel === undefined ? { 'aria-label': hiddenName } : { 'aria-labelledby': labelId };
  const state = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    'aria-required': required || undefined,
  } as const;
  const choose = (next: string) => {
    const option = options.find((candidate) => candidate.value === next);
    if (option !== undefined) onChange(option.value);
  };
  const search = t('common.search.placeholder');

  return (
    <div className="flex flex-col gap-1.5" data-slot="choice-group" data-testid={testId}>
      {visibleLabel === undefined ? null : (
        <span id={labelId} className="text-sm font-semibold">
          <span>{visibleLabel}</span>
          {required ? (
            <span data-slot="required-mark" aria-hidden className="ms-1 text-destructive">
              {REQUIRED_MARK}
            </span>
          ) : null}
        </span>
      )}
      {options.length <= RADIO_LIMIT ? (
        <RadioGroup
          value={value ?? ''}
          onValueChange={choose}
          {...named}
          {...state}
          // 44 px rows 8 px apart (AD-A11Y-05 · AD-VIS-07).
          className="flex flex-col gap-2"
        >
          {options.map((option) => {
            const optionId = `${id}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={optionId}
                className="flex min-h-11 items-center gap-3 rounded-md px-1 hover:bg-muted"
              >
                <RadioGroupItem id={optionId} value={option.value} data-testid={option.testId} />
                <DataText>{option.label}</DataText>
              </label>
            );
          })}
        </RadioGroup>
      ) : (
        <Command className="rounded-md border border-border" label={search} filter={byLabel}>
          <CommandInput placeholder={search} aria-label={search} className="text-base" />
          <CommandList
            {...(visibleLabel === undefined
              ? { label: hiddenName }
              : { 'aria-labelledby': labelId })}
            {...state}
          >
            <CommandEmpty />
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                keywords={[option.label]}
                data-checked={value === option.value}
                onSelect={() => onChange(option.value)}
                className="min-h-11 text-base"
                data-testid={option.testId}
              >
                <DataText>{option.label}</DataText>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}
      {error ? (
        <FieldMessage id={errorId}>{t(errorMessageKey(error.code), error.params)}</FieldMessage>
      ) : null}
    </div>
  );
}
