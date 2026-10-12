// THE map of tones, icons and label keys for status values and flags (AD-CMP-05 · AD-CMP-06 ·
// AD-IMPL-04 · design D8). A status is shown only through StatusBadge / FlagChip, which read this map;
// the label key is `status.<table>.<NAME>` / `status.flag.<key>`. The file holds plain objects and no
// import: `pnpm i18n:check` (tools/guards/check-i18n.mjs) loads it with Node's type stripping, so
// icons are lucide names, turned into components by the badge.

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

/** lucide icon names (kebab case). */
export type IconName =
  | 'circle'
  | 'circle-dot'
  | 'circle-check'
  | 'triangle-alert'
  | 'circle-x'
  | 'circle-slash'
  | 'lock'
  | 'send'
  | 'clock'
  | 'users'
  | 'home'
  | 'globe'
  | 'pencil'
  | 'tag'
  | 'package'
  | 'hand'
  | 'clock-alert'
  | 'user-x'
  | 'log-out'
  | 'calendar'
  | 'receipt'
  | 'coins'
  | 'rotate-ccw';

/** The default icon of each tone (design D8). */
export const TONE_ICON: Readonly<Record<Tone, IconName>> = {
  neutral: 'circle',
  info: 'circle-dot',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-x',
  muted: 'circle-slash',
};

export interface StatusStyle {
  readonly tone: Tone;
  /** Replaces the tone's icon: `lock`, or `lock` + `send` (design D8). */
  readonly icons?: readonly IconName[];
}

const neutral: StatusStyle = { tone: 'neutral' };
const info: StatusStyle = { tone: 'info' };
const success: StatusStyle = { tone: 'success' };
const warning: StatusStyle = { tone: 'warning' };
const danger: StatusStyle = { tone: 'danger' };
const muted: StatusStyle = { tone: 'muted' };
const locked = (tone: Tone): StatusStyle => ({ tone, icons: ['lock'] });

/** The 71 (table, status constant) pairs of AD-CMP-05; names as in constants/status.ts. */
export const STATUS_MAP = {
  bookings: { BOOKED: neutral, STARTED: info, COMPLETED: success, CANCELLED: muted },
  visits: { STARTED: info, COMPLETED: warning, FINISHED: success, INCOMPLETE: muted },
  sales: { OPEN: info, FINISHED: locked('success'), CANCELLED: muted },
  discount_requests: { PENDING: warning, APPROVED: success, REJECTED: danger, CANCELLED: muted },
  leaves: { PENDING: warning, APPROVED: success, REJECTED: danger, CANCELLED: muted },
  payroll_runs: {
    DRAFT: neutral,
    CALCULATED: info,
    FINALIZED: locked('warning'),
    PUBLISHED: { tone: 'warning', icons: ['lock', 'send'] },
    PAID: success,
    CANCELLED: muted,
  },
  attendance_exceptions: {
    OPEN: warning,
    EXCUSED: neutral,
    CONFIRMED: danger,
    LEAVE: info,
    VOID: muted,
  },
  purchases: { DRAFT: neutral, POSTED: locked('success'), CANCELLED: muted },
  stock_transfers: { DRAFT: neutral, SENT: info, RECEIVED: success, CANCELLED: muted },
  stock_counts: { IN_PROGRESS: info, POSTED: success, CANCELLED: muted },
  daily_closings: { OPEN: neutral, CLOSED: locked('success') },
  expenses: { PENDING: warning, APPROVED: success, REJECTED: danger },
  manual_incomes: { PENDING: warning, APPROVED: success, REJECTED: danger },
  employee_receivables: { ACTIVE: info, SETTLED: success, CANCELLED: muted },
  users: { INVITED: info, ACTIVE: success, DISABLED: muted },
  employees: { ACTIVE: success, INACTIVE: muted, RESIGNED: muted, TERMINATED: muted },
  import_jobs: {
    UPLOADED: neutral,
    VALIDATED: info,
    CONFIRMED: success,
    FAILED: danger,
    CANCELLED: muted,
  },
  import_job_rows: {
    PENDING: neutral,
    VALID: success,
    ERROR: danger,
    IMPORTED: success,
    SKIPPED: muted,
  },
  backup_runs: { RUNNING: info, SUCCESS: success, FAILED: danger },
} as const satisfies Record<string, Record<string, StatusStyle>>;

/**
 * States of AD-CMP-05 that are not a status column: a name instead of a code
 * (`<StatusBadge table="payments" state="KBZPAY_UNVERIFIED" />`). The feature change decides which applies.
 */
export const DERIVED_STATES = {
  payments: { VOIDED: muted, KBZPAY_UNVERIFIED: warning, KBZPAY_VERIFIED: success },
  cash_outs: { OUTSTANDING: warning, RETURNED: success, CONVERTED: warning, CANCELLED: muted },
  cash_returns: { CANCELLED: muted },
  expenses: { DELETED: muted },
  manual_incomes: { DELETED: muted },
  /** An open day in the past: "Not closed". */
  daily_closings: { OPEN_PAST: warning },
  /** Branch, role, service, product, customer …: ACTIVE has no badge. */
  master: { INACTIVE: muted },
} as const satisfies Record<string, Record<string, StatusStyle>>;

export interface FlagStyle {
  readonly tone: Tone;
  readonly icon: IconName;
  /** The parameter of its label: `{name}` (recorded by) or `{n}` (a count). */
  readonly param?: 'name' | 'n';
}

/**
 * The 18 flags of AD-CMP-06 / AD-CMP-05. "Reopened ×N" has no tone in AD-CMP-05: neutral and the
 * rotate icon are design D8's choice, as are the icons of the three attendance flags.
 */
export const FLAGS = {
  late_entry: { tone: 'warning', icon: 'clock' },
  proxy_recorded: { tone: 'info', icon: 'users', param: 'name' },
  home_service: { tone: 'neutral', icon: 'home' },
  online_booking: { tone: 'neutral', icon: 'globe' },
  price_changed: { tone: 'warning', icon: 'pencil' },
  discount: { tone: 'info', icon: 'tag' },
  negative_stock: { tone: 'danger', icon: 'triangle-alert' },
  low_stock: { tone: 'warning', icon: 'package' },
  manual_attendance: { tone: 'warning', icon: 'hand' },
  attendance_late: { tone: 'danger', icon: 'clock-alert' },
  attendance_absent: { tone: 'danger', icon: 'user-x' },
  attendance_early_leave: { tone: 'warning', icon: 'log-out' },
  pending_leave: { tone: 'warning', icon: 'calendar' },
  difference_sale: { tone: 'info', icon: 'receipt' },
  change_returned: { tone: 'info', icon: 'coins' },
  transfer_short: { tone: 'warning', icon: 'triangle-alert', param: 'n' },
  transfer_over: { tone: 'warning', icon: 'triangle-alert', param: 'n' },
  reopened: { tone: 'neutral', icon: 'rotate-ccw', param: 'n' },
} as const satisfies Record<string, FlagStyle>;

export type StatusMapTable = keyof typeof STATUS_MAP;
export type DerivedTable = keyof typeof DERIVED_STATES;
export type FlagKey = keyof typeof FLAGS;

/** The icons a status shows: its overrides, else the tone's icon. */
export function iconsOf(style: StatusStyle): readonly IconName[] {
  return style.icons ?? [TONE_ICON[style.tone]];
}
