'use client';

import { useCan } from '../session/grants';

// add-leave-types — who reaches what on Settings › Leave types (AD-PERM-02 · AD-PERM-03 · API-PERM-07 ·
// design D9): a company master, so every write needs its code at company scope; the screen never shows
// a control the API refuses. The API checks every request.

/** The four leave-type codes (permissions.json): any of them, at any scope, opens the screen. */
export const LEAVE_TYPE_CODES = [
  'leave_type.view',
  'leave_type.create',
  'leave_type.update',
  'leave_type.delete',
] as const;

export interface LeaveTypeAccess {
  /** Any leave-type code (leave_type.view⁺): the menu item, the list and the Archived chip. */
  readonly any: boolean;
  /** `leave_type.create` at company scope: New leave type. */
  readonly create: boolean;
  /** `leave_type.update` at company scope: the form; otherwise the values as text. */
  readonly update: boolean;
  /** `leave_type.delete` at company scope: Archive. */
  readonly archive: boolean;
}

export function useLeaveTypeAccess(): LeaveTypeAccess {
  const can = useCan();
  return {
    any: LEAVE_TYPE_CODES.some((code) => can(code)),
    create: can('leave_type.create', { level: 'company' }),
    update: can('leave_type.update', { level: 'company' }),
    archive: can('leave_type.delete', { level: 'company' }),
  };
}
