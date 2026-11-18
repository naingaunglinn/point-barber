import { type LeaveType, LeaveTypeStatus, toMmtIso, toMmtIsoMillis } from '@point/shared';

// add-leave-types task 1.5 — the one mapper of the OpenAPI `LeaveType` (CG-API-04 · API-DATA-03 · design
// D4 / D6). The leave-type repository (part A2) reads this row; nothing outside `scheduling` imports it.

/** The stored members of a leave type that the API answers. */
export interface LeaveTypeRow {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly is_paid: boolean;
  readonly sort_order: number;
  /** `leave_types_status_chk`: 0 INACTIVE · 1 ACTIVE. */
  readonly status: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

/** Every member named, so a new column never leaks (`company_id`, `created_at` stay out). */
export function toLeaveType(row: LeaveTypeRow): LeaveType {
  return {
    id: row.id,
    name_mm: row.name_mm,
    name_en: row.name_en,
    is_paid: row.is_paid,
    sort_order: row.sort_order,
    status:
      row.status === LeaveTypeStatus.ACTIVE ? LeaveTypeStatus.ACTIVE : LeaveTypeStatus.INACTIVE,
    archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
    // With its milliseconds: the value a client echoes as expected_updated_at (design D6).
    updated_at: toMmtIsoMillis(row.updated_at),
  };
}
