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
  // FINISH — the change of a non-cash over-transfer above 10,000 Ks (API Part 4 v1.4 §11 — owner WR1).
  CHANGE_TOO_LARGE: 'change_too_large',
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
  // 423 — a write on a finished record that reached the database guard (design D9: no endpoint should).
  LOCKED: 'locked',
  // add-late-entry — P4-RULE-13 · LE-1: the four late-entry times out of order or later than now.
  LATE_ENTRY_TIME: 'late_entry_time',
  // add-company-profile — API-ERR-02 · Part 1 v1.7 §11b · design D10 (task 1.2): a stale
  // `expected_updated_at` (API-IDEM-04 · CP3) and Zawgyi text refused by the server (API-SHAPE-05).
  CONFLICT: 'conflict',
  ZAWGYI_TEXT: 'zawgyi_text',
  // add-settings-store — API-ERR-02 · Part 1 §11b · P1-RULE-08 · API-AUTH-06 (task 1.8): a write of a
  // read-only key or a branch override of a company-only key; maintenance mode for a caller who may not
  // pass (texts owner-approved 05/Nov/2026, S18).
  SETTING_SCOPE: 'setting_scope',
  MAINTENANCE: 'maintenance',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** `errors[].code` of a schema failure: the Zod issue name, unchanged (API-ERR-03 v1.6). */
export const FieldIssueCode = {
  TOO_SMALL: 'too_small',
  TOO_BIG: 'too_big',
  INVALID_TYPE: 'invalid_type',
  // add-company-profile — a failed link pattern or URL check (Part 1 v1.7 §11b · CP2 · design D10).
  INVALID_FORMAT: 'invalid_format',
  // add-settings-store — a value that is not one of the listed choices (Zod 4 `invalid_value`).
  INVALID_VALUE: 'invalid_value',
} as const;

export type FieldIssueCode = (typeof FieldIssueCode)[keyof typeof FieldIssueCode];

/** Message keys the client shows that the API never returns (API-ERR-03 v1.6). */
export const ClientMessageCode = {
  REQUIRED: 'required',
  DATE_INVALID: 'date_invalid',
  UNKNOWN: 'unknown',
} as const;

export type ClientMessageCode = (typeof ClientMessageCode)[keyof typeof ClientMessageCode];
