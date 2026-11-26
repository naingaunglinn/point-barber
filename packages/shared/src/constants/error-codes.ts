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
  // add-booking-cancel-reasons — Part 3 §9 · API-ERR-02 (task 2.2): 409 when a write would switch off,
  // re-flag or archive the no-show reason (`system_code` 1 — D-BKG-17 · P3.CRS.03 / 04). Shared with
  // add-payment-methods-admin, one neutral text (point-sdd #47). already_exists and conflict are reused.
  SYSTEM_ROW: 'system_row',
  // add-payment-methods-admin — API-ERR-02 · Part 4 §11 · design D5 (task 1.2): a reference format over 200
  // characters, that does not compile or that holds a nested quantifier (P4.PMT.02 / 03 · PM6).
  INVALID_REGEX: 'invalid_regex',
  // add-company-profile — API-ERR-02 · Part 1 v1.7 §11b · design D10 (task 1.2): a stale
  // `expected_updated_at` (API-IDEM-04 · CP3) and Zawgyi text refused by the server (API-SHAPE-05).
  CONFLICT: 'conflict',
  ZAWGYI_TEXT: 'zawgyi_text',
  // add-branch-management — API-ERR-02 · Part 1 §11b (v1.7) (task 1.1): a branch code the company
  // already has (P1.BR.02), and a deactivation while the branch is in use (P1-RULE-09 · owner BR2).
  // already_exists is shared with the catalogue changes (first merge declares it — design D10).
  ALREADY_EXISTS: 'already_exists',
  BRANCH_IN_USE: 'branch_in_use',
  // add-customer-management — Part 3 §9 · API-ERR-02 (task 1.4): an archive refused while BOOKED /
  // STARTED bookings exist, context `{ count }` (P3.CUS.07 · P3-RULE-02). already_exists, conflict and
  // zawgyi_text above are reused.
  CUSTOMER_HAS_ACTIVE_BOOKINGS: 'customer_has_active_bookings',
  // add-settings-store — API-ERR-02 · Part 1 §11b · P1-RULE-08 · API-AUTH-06 (task 1.8): a write of a
  // read-only key or a branch override of a company-only key; maintenance mode for a caller who may not
  // pass (texts owner-approved 05/Nov/2026, S18).
  SETTING_SCOPE: 'setting_scope',
  MAINTENANCE: 'maintenance',
  // add-schedule-patterns — Part 2 §13b · API-ERR-02 (task 2.2; texts proposed in design S18): segment
  // times out of order or overlapping (field codes of a 400 `validation`), the cross-branch travel gap
  // (D-SCH-02) and an own change of today's shifts (422 everywhere — owner C11). effective_date_past
  // waits for its text.
  SEGMENT_OVERLAP: 'segment_overlap',
  END_BEFORE_START: 'end_before_start',
  CROSS_BRANCH_GAP: 'cross_branch_gap',
  SELF_ACTION: 'self_action',
  // add-attachments-upload — API-ERR-02 · Part 8 P8-RULE-03 · P8.ATT.05 (task 1.2; texts in the brief):
  // a file that cannot be linked, context `{ attachment_id, reason }` (422), and the removal of the
  // file a single-image field still uses, context `{ field }` (409). zawgyi_text above is reused.
  ATTACHMENT_INVALID: 'attachment_invalid',
  ATTACHMENT_IN_USE: 'attachment_in_use',
  // add-service-catalogue — Part 2 §13b · API-ERR-02 (task 2.2): a category archive refused while
  // non-archived services use it, context `{ count }` (P2.CAT.04); option pricing sent to the create
  // (P2.SVC.02) or to the update (P2.SVC.04) instead of the options endpoint (P2-RULE-02).
  CATEGORY_IN_USE: 'category_in_use',
  OPTIONS_REQUIRED: 'options_required',
  USE_OPTIONS_ENDPOINT: 'use_options_endpoint',
  // add-leave-types — Part 2 §13b · API-ERR-02 (task 1.3 — design D4 / D10): an archive refused while a
  // PENDING leave uses the type (P2.LVT.04 — no context). already_exists, conflict and zawgyi_text above
  // are reused.
  LEAVE_TYPE_IN_USE: 'leave_type_in_use',
  // add-employee-management — Part 1 §11b · API-ERR-02 (task 1.1): the last active company admin cannot
  // be switched off (P1-RULE-12 · D7). already_exists, conflict, invalid_transition and rate_limited
  // are declared above and reused; the field code not_multiple_of is in FieldIssueCode.
  LAST_ADMIN: 'last_admin',
  // add-website-management — Part 8 §16 · API-ERR-02 (task 1.4; texts proposed for the owner, S18):
  // closures (P8.WEB.06 – 08 · P8-RULE-12 · owner WM4) and the report / closure range of 366 days
  // (`context.max_days`); the four per-day field codes of a 400 `validation` week (P8.WEB.04 · WM3).
  CLOSURE_OVERLAP: 'closure_overlap',
  DATE_IN_PAST: 'date_in_past',
  CLOSURE_STARTED: 'closure_started',
  CLOSURE_PAST: 'closure_past',
  RANGE_TOO_LONG: 'range_too_long',
  CLOSES_BEFORE_OPENS: 'closes_before_opens',
  TIMES_REQUIRED: 'times_required',
  TIMES_NOT_ALLOWED: 'times_not_allowed',
  OVERNIGHT_NOT_ALLOWED: 'overnight_not_allowed',
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
  // add-employee-management — the rating step: 4.7 is not a multiple of 0.5 (Zod 4 `not_multiple_of`).
  NOT_MULTIPLE_OF: 'not_multiple_of',
} as const;

export type FieldIssueCode = (typeof FieldIssueCode)[keyof typeof FieldIssueCode];

/** Message keys the client shows that the API never returns (API-ERR-03 v1.6). */
export const ClientMessageCode = {
  REQUIRED: 'required',
  DATE_INVALID: 'date_invalid',
  UNKNOWN: 'unknown',
} as const;

export type ClientMessageCode = (typeof ClientMessageCode)[keyof typeof ClientMessageCode];
