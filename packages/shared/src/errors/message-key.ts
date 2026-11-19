import {
  ClientMessageCode,
  ErrorCode,
  FieldIssueCode,
  type ErrorCode as ErrorCodeValue,
} from '../constants/error-codes.js';

// A problem and a field issue are shown through their `code` as the language key `error.<code>`
// (API-ERR-01 · API-ERR-03 · design D6 / D9); the developer text `detail` is never shown.

type KnownCode = ErrorCodeValue | FieldIssueCode | ClientMessageCode;
export type ErrorMessageKey = `error.${KnownCode}`;

const KNOWN = new Set<string>([
  ...Object.values(ErrorCode),
  ...Object.values(FieldIssueCode),
  ...Object.values(ClientMessageCode),
]);

function isKnown(code: string): code is KnownCode {
  return KNOWN.has(code);
}

/** `forbidden` → `error.forbidden`; a code without a key → `error.unknown`. */
export function errorMessageKey(code: string): ErrorMessageKey {
  return isKnown(code) ? `error.${code}` : 'error.unknown';
}

/** A client Zod issue or a server `errors[]` item (`{ field, code, params }`). */
export interface FieldIssue {
  readonly code: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly minimum?: unknown;
  readonly maximum?: unknown;
}

export interface FieldMessage {
  readonly key: ErrorMessageKey;
  readonly params: Readonly<Record<string, unknown>>;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return Array.isArray(value) && value.length === 0;
}

/**
 * The message of a field issue (design D9): a catalogue code → `error.<code>`; a missing value
 * (`invalid_type` on undefined, `too_small` on an empty text or list) → `error.required`;
 * `too_small` → `error.too_small` {minimum}; `too_big` → `error.too_big` {maximum};
 * `invalid_type` → `error.invalid_type`. `value` is the field's current value.
 */
export function fieldMessageKey(issue: FieldIssue, value: unknown): FieldMessage {
  switch (issue.code) {
    case FieldIssueCode.INVALID_TYPE:
      return value === undefined
        ? { key: 'error.required', params: {} }
        : { key: 'error.invalid_type', params: {} };
    case FieldIssueCode.TOO_SMALL:
      return isEmpty(value)
        ? { key: 'error.required', params: {} }
        : { key: 'error.too_small', params: { minimum: issue.params?.minimum ?? issue.minimum } };
    case FieldIssueCode.TOO_BIG:
      return { key: 'error.too_big', params: { maximum: issue.params?.maximum ?? issue.maximum } };
    default:
      return { key: errorMessageKey(issue.code), params: issue.params ?? {} };
  }
}
