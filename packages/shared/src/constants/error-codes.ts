// Problem `code` values — each is also the language key `error.<code>` (API-ERR-01 · API-ERR-02 ·
// CG-ERR-03). add-repo-scaffold adds the three codes it raises; add-shared-ui-components the codes
// its components show (design D6); every later change adds its own from API-ERR-02 or its part's
// error table, together with both language files.
export const ErrorCode = {
  VALIDATION: 'validation',
  NOT_FOUND: 'not_found',
  INTERNAL_ERROR: 'internal_error',
  FORBIDDEN: 'forbidden',
  PHONE_INVALID: 'phone_invalid',
  AMOUNT_INVALID: 'amount_invalid',
  REASON_REQUIRED: 'reason_required',
  FILE_TOO_LARGE: 'file_too_large',
  FILE_TYPE_NOT_ALLOWED: 'file_type_not_allowed',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** `errors[].code` of a schema failure: the Zod issue name, unchanged (API-ERR-03 v1.6). */
export const FieldIssueCode = {
  TOO_SMALL: 'too_small',
  TOO_BIG: 'too_big',
  INVALID_TYPE: 'invalid_type',
} as const;

export type FieldIssueCode = (typeof FieldIssueCode)[keyof typeof FieldIssueCode];

/** Message keys the client shows that the API never returns (API-ERR-03 v1.6). */
export const ClientMessageCode = {
  REQUIRED: 'required',
  DATE_INVALID: 'date_invalid',
  UNKNOWN: 'unknown',
} as const;

export type ClientMessageCode = (typeof ClientMessageCode)[keyof typeof ClientMessageCode];
