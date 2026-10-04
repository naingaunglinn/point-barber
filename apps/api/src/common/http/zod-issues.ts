import { CATALOGUE_CODE_PREFIX, type FieldError } from '@point/shared';
import type { z } from 'zod';

// Zod issues → problem `errors[]` items (API-ERR-03, Part 0 v1.6 — owner answer S5 · design D8):
// `field` = the dotted path with [n] for array positions; `code` = the catalogue code the schema
// named (catalogueCode()) or else the Zod issue name unchanged; `params` = the bound or the
// expected type. The API never produces `required`, `date_invalid` or `unknown` (client-only keys).

function fieldOf(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc === '' ? String(key) : `${acc}.${String(key)}`;
  }, '');
}

function paramsOf(issue: z.core.$ZodIssue): Record<string, unknown> | undefined {
  switch (issue.code) {
    case 'too_small':
      return { minimum: Number(issue.minimum) };
    case 'too_big':
      return { maximum: Number(issue.maximum) };
    case 'invalid_type':
      return { expected: issue.expected };
    default:
      return undefined;
  }
}

export function toFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldError[] {
  return issues.map((issue) => {
    const field = fieldOf(issue.path);
    if (issue.message.startsWith(CATALOGUE_CODE_PREFIX)) {
      return { field, code: issue.message.slice(CATALOGUE_CODE_PREFIX.length) };
    }
    const params = paramsOf(issue);
    return params === undefined ? { field, code: issue.code } : { field, code: issue.code, params };
  });
}
