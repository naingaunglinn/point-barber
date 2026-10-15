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
  // add-foundation-auth-access — API-ERR-02 · Part 1 §11b · D4 · D11 (task 1.3).
  UNAUTHENTICATED: 'unauthenticated',
  SESSION_REVOKED: 'session_revoked',
  OTP_INVALID: 'otp_invalid',
  LOGIN_LOCKED: 'login_locked',
  // Declared for the parts whose endpoint text names it (API-PERM-03 v1.6); no endpoint of
  // add-foundation-auth-access returns it.
  OUT_OF_SCOPE: 'out_of_scope',
  COMPANY_SCOPE_REQUIRED: 'company_scope_required',
  CSRF: 'csrf',
  RATE_LIMITED: 'rate_limited',
  IDEMPOTENCY_KEY_REQUIRED: 'idempotency_key_required',
  IDEMPOTENCY_IN_PROGRESS: 'idempotency_in_progress',
  IDEMPOTENCY_MISMATCH: 'idempotency_mismatch',
  // Catalogue field codes inside `errors[]`, named by a schema with catalogueCode() (API-ERR-03 v1.6
  // · Part 1 v1.6 §11b · D4).
  EMAIL_INVALID: 'email_invalid',
  OTP_FORMAT: 'otp_format',
  // add-walkin-visit-checkout — API-ERR-02 · Part 4 §11 · Part 2 / 3 / 5 / 7 rules this change applies
  // (task 2.12). out_of_scope, phone_invalid and reason_required are above.
  UNPAID_VISIT_OPEN: 'unpaid_visit_open',
  DAY_CLOSED: 'day_closed',
  DATE_IN_FUTURE: 'date_in_future',
  PAYROLL_FINALIZED: 'payroll_finalized',
  SERVICE_REQUIRED: 'service_required',
  VISIT_NOT_COMPLETED: 'visit_not_completed',
  PAYMENTS_EXIST: 'payments_exist',
  AMOUNT_MISMATCH: 'amount_mismatch',
  AMOUNT_EXCEEDS_REMAINING: 'amount_exceeds_remaining',
  REFERENCE_REQUIRED: 'reference_required',
  REFERENCE_FORMAT: 'reference_format',
  DUPLICATE_REFERENCE: 'duplicate_reference',
  TOTAL_CHANGED: 'total_changed',
  INVALID_TRANSITION: 'invalid_transition',
  NOT_SOLD_HERE: 'not_sold_here',
  VARIANT_REQUIRED: 'variant_required',
  SERVICE_INACTIVE: 'service_inactive',
  CATEGORY_INACTIVE: 'category_inactive',
  OUTSIDE_WINDOW: 'outside_window',
  NOT_ASSIGNED_TO_BRANCH: 'not_assigned_to_branch',
  // A payment method that is not ACTIVE — the code Part 7 §12 defines for it, applied to P4.PAY.02.
  METHOD_INACTIVE: 'method_inactive',
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
