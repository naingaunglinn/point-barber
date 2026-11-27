// Public surface of the `scheduling` module (CG-ARCH-01 · ADR-001 rule 1).
export { SchedulingModule } from './scheduling.module.js';
// add-leave-types (design D1): the leave-type service — `lockActive(tx, id)` is the type lock of
// add-leave-requests (#32) — and the row it answers.
export { LeaveTypes } from './leave-types/leave-types.js';
export type { LeaveTypeRow } from './leave-types/leave-type-mapper.js';
// add-payment-collector-picker (design D4 · owner CL1): the open attendance records of a branch — the
// read of add-attendance-clock (#47), created here until #47 merges.
export { Attendance } from './attendance/attendance.js';
export type { OpenAttendanceRecord } from './repositories/attendance.repository.js';
