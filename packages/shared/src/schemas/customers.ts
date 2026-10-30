import { z } from 'zod';

import { CustomerStatus } from '../constants/status.js';
import { codeOf, wireDateTime } from './wire.js';

// The customer lookup DTO of add-walkin-visit-checkout (task 2.4) — point-sdd
// docs/api/openapi/part3-customers-booking.yaml v1.1 `CustomerLookup` (P3.CUS.02 · API-ERR-03).

/** `UpcomingBooking` — a BOOKED booking of the customer from now on. */
export const upcomingBookingSchema = z.strictObject({
  id: z.uuid(),
  starts_at: wireDateTime,
  branch_id: z.uuid(),
  booked_employee_id: z.uuid().optional(),
});

/** `CustomerLookup` — P3.CUS.02, the phone lookup of the Finish step. */
export const customerLookupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  status: codeOf(CustomerStatus),
  notes: z.string().nullable(),
  last_visit_at: wireDateTime.nullable(),
  upcoming_bookings: z.array(upcomingBookingSchema),
});

/** P3.CUS.02 query: the phone as typed; the service normalises it (400 `phone_invalid`). */
export const customerLookupQuerySchema = z.object({ phone: z.string().max(50) });

export type CustomerLookupDto = z.infer<typeof customerLookupSchema>;
export type CustomerLookupQuery = z.infer<typeof customerLookupQuerySchema>;
