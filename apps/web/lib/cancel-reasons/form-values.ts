import { z } from 'zod';

import {
  type CancelReason,
  type CancelReasonCreate,
  CancelReasonStatus,
  type CancelReasonUpdate,
  cancelReasonCreateSchema,
  cancelReasonUpdateSchema,
} from '@point/shared';

// add-booking-cancel-reasons — the cancel-reason form's values and the bodies they become (P3.CRS.02 / 03 ·
// AD-FORM-03 / 04 · design D9). Every value is its input's text or choice; the body is checked by the
// API's own schema, so the form shows the messages the API would send on the same members. An edit sends
// only the members whose input changed, and `expected_updated_at` (API-IDEM-04).

/** `status` as the form's choice. */
export const STATUS = { ACTIVE: '1', INACTIVE: '0' } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];

export interface CancelReasonFormValues {
  name_mm: string;
  name_en: string;
  requires_note: boolean;
  status: Status;
}

export function emptyCancelReasonValues(): CancelReasonFormValues {
  return { name_mm: '', name_en: '', requires_note: false, status: STATUS.ACTIVE };
}

/** The inputs of a stored reason. */
export function cancelReasonValues(reason: CancelReason): CancelReasonFormValues {
  return {
    name_mm: reason.name_mm,
    name_en: reason.name_en ?? '',
    requires_note: reason.requires_note,
    status: reason.status === CancelReasonStatus.ACTIVE ? STATUS.ACTIVE : STATUS.INACTIVE,
  };
}

const blank = (text: string) => text.trim() === '';

/** P3.CRS.02: the names and the flag; the position is the API's (CR1). */
export function createBody(values: CancelReasonFormValues): Record<string, unknown> {
  return {
    name_mm: values.name_mm,
    ...(blank(values.name_en) ? {} : { name_en: values.name_en }),
    requires_note: values.requires_note,
  };
}

/** P3.CRS.03: the changed members — a cleared English name is null — and `expected_updated_at`. */
export function updateBody(
  values: CancelReasonFormValues,
  stored: CancelReasonFormValues,
  expectedUpdatedAt: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (values.name_mm !== stored.name_mm) body.name_mm = values.name_mm;
  if (values.name_en !== stored.name_en)
    body.name_en = blank(values.name_en) ? null : values.name_en;
  if (values.requires_note !== stored.requires_note) body.requires_note = values.requires_note;
  if (values.status !== stored.status) body.status = Number(values.status);
  body.expected_updated_at = expectedUpdatedAt;
  return body;
}

/** The create form's schema: the inputs → the body → `cancelReasonCreateSchema`. */
export const createFormSchema: z.ZodType<CancelReasonCreate, CancelReasonFormValues> = z
  .custom<CancelReasonFormValues>()
  .transform((values): unknown => createBody(values))
  .pipe(cancelReasonCreateSchema);

/** The edit form's schema for one stored reason: the changed members → `cancelReasonUpdateSchema`. */
export function updateFormSchema(
  stored: CancelReasonFormValues,
  expectedUpdatedAt: string,
): z.ZodType<CancelReasonUpdate, CancelReasonFormValues> {
  return z
    .custom<CancelReasonFormValues>()
    .transform((values): unknown => updateBody(values, stored, expectedUpdatedAt))
    .pipe(cancelReasonUpdateSchema);
}
