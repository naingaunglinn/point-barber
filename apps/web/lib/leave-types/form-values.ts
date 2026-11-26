import { z } from 'zod';

import {
  type LeaveType,
  type LeaveTypeCreateBody,
  type LeaveTypeUpdateBody,
  LeaveTypeStatus,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
} from '@point/shared';

// add-leave-types — the leave-type form's values and the bodies they become (P2.LVT.02 / 03 · AD-FORM-03
// / 04 · design D4 · D9). Every value is its input's text or choice; the body is checked by the API's
// own schema, so the form shows the messages the API would send on the same members. An edit sends only
// the members whose input changed, and `expected_updated_at` (API-IDEM-04).

/** `is_paid` as the form's choice; nothing chosen on create (D9). */
export const PAID = { PAID: 'paid', UNPAID: 'unpaid' } as const;
type Paid = (typeof PAID)[keyof typeof PAID];
/** `status` as the form's choice. */
export const STATUS = { ACTIVE: '1', INACTIVE: '0' } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];

export interface LeaveTypeFormValues {
  name_mm: string;
  name_en: string;
  is_paid: Paid | '';
  status: Status;
}

export function emptyLeaveTypeValues(): LeaveTypeFormValues {
  return { name_mm: '', name_en: '', is_paid: '', status: STATUS.ACTIVE };
}

/** The inputs of a stored type. */
export function leaveTypeValues(type: LeaveType): LeaveTypeFormValues {
  return {
    name_mm: type.name_mm,
    name_en: type.name_en ?? '',
    is_paid: type.is_paid ? PAID.PAID : PAID.UNPAID,
    status: type.status === LeaveTypeStatus.ACTIVE ? STATUS.ACTIVE : STATUS.INACTIVE,
  };
}

const blank = (text: string) => text.trim() === '';

/** P2.LVT.02: the names and the choice; no choice leaves `is_paid` out, so the schema asks for it. */
export function createBody(values: LeaveTypeFormValues): Record<string, unknown> {
  return {
    name_mm: values.name_mm,
    ...(blank(values.name_en) ? {} : { name_en: values.name_en }),
    ...(values.is_paid === '' ? {} : { is_paid: values.is_paid === PAID.PAID }),
  };
}

/** P2.LVT.03: the changed members — a cleared English name is null — and `expected_updated_at`. */
export function updateBody(
  values: LeaveTypeFormValues,
  stored: LeaveTypeFormValues,
  expectedUpdatedAt: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (values.name_mm !== stored.name_mm) body.name_mm = values.name_mm;
  if (values.name_en !== stored.name_en)
    body.name_en = blank(values.name_en) ? null : values.name_en;
  if (values.is_paid !== stored.is_paid) body.is_paid = values.is_paid === PAID.PAID;
  if (values.status !== stored.status) body.status = Number(values.status);
  body.expected_updated_at = expectedUpdatedAt;
  return body;
}

/** The create form's schema: the inputs → the body → `leaveTypeCreateSchema`. */
export const createFormSchema: z.ZodType<LeaveTypeCreateBody, LeaveTypeFormValues> = z
  .custom<LeaveTypeFormValues>()
  .transform((values): unknown => createBody(values))
  .pipe(leaveTypeCreateSchema);

/** The edit form's schema for one stored type: the changed members → `leaveTypeUpdateSchema`. */
export function updateFormSchema(
  stored: LeaveTypeFormValues,
  expectedUpdatedAt: string,
): z.ZodType<LeaveTypeUpdateBody, LeaveTypeFormValues> {
  return z
    .custom<LeaveTypeFormValues>()
    .transform((values): unknown => updateBody(values, stored, expectedUpdatedAt))
    .pipe(leaveTypeUpdateSchema);
}
