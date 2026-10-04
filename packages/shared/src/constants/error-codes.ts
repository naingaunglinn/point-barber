// Problem `code` values — each is also the language key `error.<code>` (API-ERR-01 · API-ERR-02 ·
// CG-ERR-03). add-repo-scaffold adds the three codes it raises; every later change adds its own
// from API-ERR-02 or its part's error table, together with both language files.
export const ErrorCode = {
  VALIDATION: 'validation',
  NOT_FOUND: 'not_found',
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
