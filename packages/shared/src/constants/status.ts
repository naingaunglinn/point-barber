// Status columns are smallint codes with named constants (D-DB-03 · API-DATA-04 · AD-IMPL-04):
// code never compares a status with a number literal, it uses these names. The values are the DBML
// notes of point-sdd/docs/db (parts 1–8) for the 19 tables of AD-CMP-05. Whichever of
// add-shared-ui-components and add-foundation-auth-access merges first creates this file; the other
// extends it — a constant is never declared twice.

/** part3 — D-BKG-18. */
export const BookingStatus = { CANCELLED: 0, BOOKED: 1, STARTED: 2, COMPLETED: 3 } as const;
/** part4 — D-VIS-07 · D-VIS-09. */
export const VisitStatus = { INCOMPLETE: 0, STARTED: 1, COMPLETED: 2, FINISHED: 3 } as const;
/** part4 — FINISHED is immutable (D-VIS-08). */
export const SaleStatus = { CANCELLED: 0, OPEN: 1, FINISHED: 2 } as const;
/** part4. */
export const DiscountRequestStatus = {
  CANCELLED: 0,
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
} as const;
/** part2. */
export const LeaveStatus = { CANCELLED: 0, PENDING: 1, APPROVED: 2, REJECTED: 3 } as const;
/** part5 — D-PAYR-06. */
export const PayrollRunStatus = {
  CANCELLED: 0,
  DRAFT: 1,
  CALCULATED: 2,
  FINALIZED: 3,
  PUBLISHED: 4,
  PAID: 5,
} as const;
/** part5. */
export const AttendanceExceptionStatus = {
  VOID: 0,
  OPEN: 1,
  EXCUSED: 2,
  CONFIRMED: 3,
  LEAVE: 4,
} as const;
/** part6 — POSTED is immutable. */
export const PurchaseStatus = { CANCELLED: 0, DRAFT: 1, POSTED: 2 } as const;
/** part6. */
export const StockTransferStatus = { CANCELLED: 0, DRAFT: 1, SENT: 2, RECEIVED: 3 } as const;
/** part6 — POSTED is immutable. */
export const StockCountStatus = { CANCELLED: 0, IN_PROGRESS: 1, POSTED: 2 } as const;
/** part7 — D-FIN-06; a reopen sets OPEN again. */
export const DailyClosingStatus = { OPEN: 1, CLOSED: 2 } as const;
/** part7 — D-FIN-03. */
export const ExpenseStatus = { PENDING: 1, APPROVED: 2, REJECTED: 3 } as const;
/** part7. */
export const ManualIncomeStatus = { PENDING: 1, APPROVED: 2, REJECTED: 3 } as const;
/** part5. */
export const EmployeeReceivableStatus = { CANCELLED: 0, ACTIVE: 1, SETTLED: 2 } as const;
/** part1. */
export const UserStatus = { DISABLED: 0, ACTIVE: 1, INVITED: 2 } as const;
/** part1 — D-EMP-04. */
export const EmployeeStatus = { INACTIVE: 0, ACTIVE: 1, RESIGNED: 2, TERMINATED: 3 } as const;
/** part8 — D-DAT-01. */
export const ImportJobStatus = {
  CANCELLED: 0,
  UPLOADED: 1,
  VALIDATED: 2,
  CONFIRMED: 3,
  FAILED: 4,
} as const;
/** part8. */
export const ImportJobRowStatus = {
  PENDING: 1,
  VALID: 2,
  ERROR: 3,
  IMPORTED: 4,
  SKIPPED: 5,
} as const;
/** part8. */
export const BackupRunStatus = { RUNNING: 1, SUCCESS: 2, FAILED: 3 } as const;

/** The constants by table name — the key the status map and the language keys use. */
export const STATUS_BY_TABLE = {
  bookings: BookingStatus,
  visits: VisitStatus,
  sales: SaleStatus,
  discount_requests: DiscountRequestStatus,
  leaves: LeaveStatus,
  payroll_runs: PayrollRunStatus,
  attendance_exceptions: AttendanceExceptionStatus,
  purchases: PurchaseStatus,
  stock_transfers: StockTransferStatus,
  stock_counts: StockCountStatus,
  daily_closings: DailyClosingStatus,
  expenses: ExpenseStatus,
  manual_incomes: ManualIncomeStatus,
  employee_receivables: EmployeeReceivableStatus,
  users: UserStatus,
  employees: EmployeeStatus,
  import_jobs: ImportJobStatus,
  import_job_rows: ImportJobRowStatus,
  backup_runs: BackupRunStatus,
} as const;

export type StatusTable = keyof typeof STATUS_BY_TABLE;
/** A status code of one table: `StatusCode<'sales'>` = 0 | 1 | 2. */
export type StatusCode<T extends StatusTable> =
  (typeof STATUS_BY_TABLE)[T][keyof (typeof STATUS_BY_TABLE)[T]];

// add-foundation-auth-access — DB Part 1 v3.4, Part 1b v1, Part 8 v1.1 (task 1.2). Not in
// STATUS_BY_TABLE: no status label shows them (AD-CMP-05). Each set equals the CHECK list of its
// column in db/source (status.test.ts).

/** part1 — roles.status. */
export const RoleStatus = { INACTIVE: 0, ACTIVE: 1 } as const;
export type RoleStatus = (typeof RoleStatus)[keyof typeof RoleStatus];

/** part1 — branches.status. */
export const BranchStatus = { INACTIVE: 0, ACTIVE: 1 } as const;
export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];

/** part1 — employee_roles.scope_type; COMPANY reaches every branch, also later ones. */
export const ScopeType = { COMPANY: 1, BRANCHES: 2 } as const;
export type ScopeType = (typeof ScopeType)[keyof typeof ScopeType];

/** part1b — user_sessions.login_method. */
export const LoginMethod = { GOOGLE: 1, EMAIL_OTP: 2 } as const;
export type LoginMethod = (typeof LoginMethod)[keyof typeof LoginMethod];

/** part1b — user_sessions.revoke_reason; also the `reason` of a session_revoked problem. */
export const RevokeReason = {
  LOGOUT: 1,
  DEVICE_REMOVED: 2,
  ADMIN_REVOKE_ALL: 3,
  ACCOUNT_INACTIVE: 4,
} as const;
export type RevokeReason = (typeof RevokeReason)[keyof typeof RevokeReason];

/** part8 — audit_events.source. */
export const AuditSource = { APP: 1, DB_TRIGGER: 2, SYSTEM_JOB: 3 } as const;
export type AuditSource = (typeof AuditSource)[keyof typeof AuditSource];

/** part1 — users.ui_language; NULL = the system default (D-PLT-03). */
export const UiLanguage = { MY: 1, EN: 2 } as const;
export type UiLanguage = (typeof UiLanguage)[keyof typeof UiLanguage];

/** part4 — visits.location_type (D-SVC-06); also the `location_type` of a price quote. */
export const LocationType = { BRANCH: 1, HOME: 2 } as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

/** part4 — sale_items.line_type; TRANSPORT_FEE = the home-service fee line (D-SVC-06). */
export const SaleItemLineType = { SERVICE: 1, PRODUCT: 2, TRANSPORT_FEE: 3 } as const;
export type SaleItemLineType = (typeof SaleItemLineType)[keyof typeof SaleItemLineType];

/** part4 — payment_methods.kind (D-PAY-01). */
export const PaymentMethodKind = { CASH: 1, MOBILE_WALLET: 2, BANK_TRANSFER: 3, CARD: 4 } as const;
export type PaymentMethodKind = (typeof PaymentMethodKind)[keyof typeof PaymentMethodKind];

/** part4 — payment_methods.status. */
export const PaymentMethodStatus = { INACTIVE: 0, ACTIVE: 1 } as const;
export type PaymentMethodStatus = (typeof PaymentMethodStatus)[keyof typeof PaymentMethodStatus];

/** part4 — refunds.kind; OVERPAYMENT_RETURN = the change of a non-cash over-transfer (D-PAY-05). */
export const RefundKind = { SALE_REFUND: 1, OVERPAYMENT_RETURN: 2 } as const;
export type RefundKind = (typeof RefundKind)[keyof typeof RefundKind];

/** part4 — receipt_counters.kind: the sale series and the RF series (D-PAY-06). */
export const ReceiptCounterKind = { SALE: 1, REFUND: 2 } as const;
export type ReceiptCounterKind = (typeof ReceiptCounterKind)[keyof typeof ReceiptCounterKind];

/**
 * Part 2 P2-RULE-03 / 05 — the `price_source` of a quote item (no column: an API value). HOME_FALLBACK_BRANCH
 * = a HOME quote that used the branch-level BRANCH row because no HOME row exists.
 */
export const PriceSource = {
  BRANCH: 1,
  BARBER_OVERRIDE: 2,
  HOME: 3,
  HOME_FALLBACK_BRANCH: 4,
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

// add-walkin-visit-checkout — the enums of the Part 2 / 3 / 4 response DTOs (task 2.2 – 2.4). Each set
// equals the CHECK list of its column in db/source (status.test.ts).

/** part4 — visits.proxy_reason; NULL = recorded by the performer (D-VIS-04 / 12). */
export const ProxyReason = { PHONE_UNAVAILABLE: 1, OTHER: 2 } as const;
export type ProxyReason = (typeof ProxyReason)[keyof typeof ProxyReason];

/** part4 — visits.late_entry_reason; NULL = not a late entry (D-VIS-13). */
export const LateEntryReason = {
  INTERNET_OUTAGE: 1,
  POWER_OUTAGE: 2,
  PHONE_BROKEN: 3,
  FORGOT: 4,
  OTHER: 9,
} as const;
export type LateEntryReason = (typeof LateEntryReason)[keyof typeof LateEntryReason];

/** part4 — discount_codes.discount_type and discount_requests.discount_type. */
export const DiscountType = { PERCENT: 1, AMOUNT: 2 } as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

/** part4 — sale_adjustments.adjustment_type; OTHER = a note only (F-P4-07). */
export const SaleAdjustmentType = {
  PAYMENT_METHOD: 1,
  PERFORMER: 2,
  COLLECTED_BY: 3,
  OTHER: 9,
} as const;
export type SaleAdjustmentType = (typeof SaleAdjustmentType)[keyof typeof SaleAdjustmentType];

/** part2 — services.pricing_mode (D-SVC-05). */
export const ServicePricingMode = { SIMPLE: 1, OPTIONS: 2 } as const;
export type ServicePricingMode = (typeof ServicePricingMode)[keyof typeof ServicePricingMode];

/** part2 — services.status. */
export const ServiceStatus = { INACTIVE: 0, ACTIVE: 1 } as const;
export type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

/** part3 — customers.status. */
export const CustomerStatus = { INACTIVE: 0, ACTIVE: 1 } as const;
export type CustomerStatus = (typeof CustomerStatus)[keyof typeof CustomerStatus];
