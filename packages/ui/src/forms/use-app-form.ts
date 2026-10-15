'use client';

import { toNestErrors } from '@hookform/resolvers';
import {
  get,
  useForm,
  type FieldError as FormError,
  type FieldErrors,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';

import { CATALOGUE_CODE_PREFIX, fieldMessageKey, type Problem } from '@point/shared';

import type { FieldError } from '../components/FormField/FormField';

// Forms of the system (AD-FORM-03 · AD-FORM-04 · API-ERR-03 · CG-UI-06 · design D9): React Hook Form
// with the Zod schema of packages/shared, validated on blur and on submit, again on every change once
// a field shows an error; the submit button stays enabled while the form is invalid. A field error
// keeps the code of its language key in `type` and that key's params, as JSON, in `message`.

type Params = Readonly<Record<string, unknown>>;

/** A field error as the form stores it, for a code and the field's current value (design D9). */
function formError(code: string, params: Params | undefined, value: unknown): FormError {
  const { key, params: keyParams } = fieldMessageKey(
    { code, ...(params ? { params } : {}) },
    value,
  );
  return { type: key.slice('error.'.length), message: JSON.stringify(keyParams) };
}

/** The bound of a Zod issue — the same params the API sends (apps/api/src/common/http/zod-issues.ts). */
function paramsOf(issue: z.core.$ZodIssue): Params | undefined {
  if (issue.code === 'too_small') return { minimum: Number(issue.minimum) };
  if (issue.code === 'too_big') return { maximum: Number(issue.maximum) };
  return undefined;
}

/** The schema's issues as form errors: the catalogue code a schema names, else the Zod issue name. */
export function formResolver<Input extends FieldValues, Output>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
  return async (values, _context, options) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, FormError> = {};
    for (const issue of result.error.issues) {
      const name = issue.path.map(String).join('.');
      if (name in errors) continue; // one message per field: the first issue
      const named = issue.message.startsWith(CATALOGUE_CODE_PREFIX)
        ? issue.message.slice(CATALOGUE_CODE_PREFIX.length)
        : null;
      errors[name] = formError(
        named ?? issue.code,
        named ? undefined : paramsOf(issue),
        get(values, name),
      );
    }
    return { values: {}, errors: toNestErrors(errors, options) };
  };
}

export type AppFormProps<Input extends FieldValues, Output> = Omit<
  UseFormProps<Input, unknown, Output>,
  'resolver' | 'mode' | 'reValidateMode'
>;

export function useAppForm<Input extends FieldValues, Output>(
  schema: z.ZodType<Output, Input>,
  props: AppFormProps<Input, Output> = {},
): UseFormReturn<Input, unknown, Output> {
  return useForm<Input, unknown, Output>({
    ...props,
    resolver: formResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    shouldFocusError: true,
  });
}

/** `register()` for a control in a `FormField`: re-validated on every change once it shows an error. */
export function registerField<Input extends FieldValues, Output>(
  form: UseFormReturn<Input, unknown, Output>,
  name: Path<Input>,
) {
  return form.register(name, {
    onChange: () => {
      if (form.getFieldState(name).error) void form.trigger(name);
    },
  });
}

/** The error of a field for `FormField` (`{ code, params }`), or undefined. */
export function fieldErrorOf(errors: FieldErrors, name: string): FieldError | undefined {
  const error = get(errors, name) as FormError | undefined;
  if (error?.type === undefined) return undefined;
  const params = error.message ? (JSON.parse(error.message) as Params) : {};
  const shown = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === 'string' || typeof entry[1] === 'number',
    ),
  );
  return { code: String(error.type), params: shown };
}

type ProblemTarget = Pick<UseFormReturn<FieldValues>, 'setError' | 'getValues'>;

/**
 * Puts the `errors[]` of a problem under their fields (API-ERR-03: `lines[1].qty` → `lines.1.qty`) and
 * focuses the first. Returns the problem when it names no field — the form shows it in an inline
 * alert at the top (`FormAlert`), not only in a toast — and null when every message is on a field.
 */
export function applyProblem<Input extends FieldValues, Output>(
  form: UseFormReturn<Input, unknown, Output> | ProblemTarget,
  problem: Problem,
): Problem | null {
  const target = form as ProblemTarget;
  const items = problem.errors ?? [];
  items.forEach((item, index) => {
    const name = item.field.replace(/\[(\d+)\]/g, '.$1');
    target.setError(name, formError(item.code, item.params, target.getValues(name)), {
      shouldFocus: index === 0,
    });
  });
  return items.length === 0 ? problem : null;
}
