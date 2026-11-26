'use client';

import { useCan } from '../session/grants';

// add-booking-cancel-reasons — who reaches what on Settings › Cancel reasons (AD-PERM-02 · AD-PERM-03 ·
// API-PERM-07 · design D9): a company master, so every write needs its code at company scope; the screen
// never shows a control the API refuses. The API checks every request.

/** The four cancel-reason codes (permissions.json): any of them, at any scope, opens the screen. */
export const CANCEL_REASON_CODES = [
  'booking_cancel_reason.view',
  'booking_cancel_reason.create',
  'booking_cancel_reason.update',
  'booking_cancel_reason.delete',
] as const;

export interface CancelReasonAccess {
  /** Any cancel-reason code (booking_cancel_reason.view⁺): the menu item, the list, Show archived. */
  readonly any: boolean;
  /** `booking_cancel_reason.create` at company scope: Add cancel reason. */
  readonly create: boolean;
  /** `booking_cancel_reason.update` at company scope: Edit and the order controls. */
  readonly update: boolean;
  /** `booking_cancel_reason.delete` at company scope: Archive. */
  readonly archive: boolean;
}

export function useCancelReasonAccess(): CancelReasonAccess {
  const can = useCan();
  return {
    any: CANCEL_REASON_CODES.some((code) => can(code)),
    create: can('booking_cancel_reason.create', { level: 'company' }),
    update: can('booking_cancel_reason.update', { level: 'company' }),
    archive: can('booking_cancel_reason.delete', { level: 'company' }),
  };
}
