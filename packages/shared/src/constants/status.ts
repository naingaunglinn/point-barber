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
