import { z } from 'zod';

import {
  type CustomerCreateBody,
  catalogueCode,
  customerCreateSchema,
  customerPhoneSchema,
  normalizePhone,
} from '@point/shared';

// add-customer-management — the add form's values and the body they become (P3.CUS.03 · AD-FORM-03 / 04 ·
// design D4 · D11). Every value is the text of its input; the body is checked by the API's own schema, so
// the form shows the messages the API would send, on the same members (`name`, `phone`, `notes`). A blank
// phone is `required` and a number that is no Myanmar or international number is `phone_invalid` before the
// request leaves (AD-FORM-10); the API checks it again. Blank notes are not sent.

export interface CustomerFormValues {
  name: string;
  phone: string;
  notes: string;
}

/** A new customer: every input empty. */
export const emptyCustomerValues = (): CustomerFormValues => ({ name: '', phone: '', notes: '' });

const bodySchema = customerCreateSchema.extend({
  phone: customerPhoneSchema
    .min(1)
    .refine((phone) => normalizePhone(phone) !== 'phone_invalid', catalogueCode('phone_invalid')),
});

/** The body of the values: blank notes are left out (the API stores no empty notes). */
function createBody({ name, phone, notes }: CustomerFormValues): unknown {
  return { name, phone, ...(notes.trim() === '' ? {} : { notes }) };
}

/** The add form's schema: the inputs → the body → the API's schema. */
export const createFormSchema: z.ZodType<CustomerCreateBody, CustomerFormValues> = z
  .custom<CustomerFormValues>()
  .transform((values): unknown => createBody(values))
  .pipe(bodySchema);
