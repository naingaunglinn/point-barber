import { z } from 'zod';

import { normalizeReceiptNumber } from '../format/receipt-number.js';
import { listQuerySchema } from './list-query.js';
import { wireDate, wireDateTime } from './wire.js';

// add-receipts-list-lookup design D3 — P4.RCP.03 (`GET /v1/receipts/lookup`) and P4.RCP.04
// (`GET /v1/receipts`): any staff member in read scope, no amounts (AD-PERM-05). `ReceiptListItem` is
// strict, so no member the contract does not name can reach a colleague.

/** `ReceiptListItem` — one receipt of a day's list: no amount, payment, customer or phone. */
export const receiptListItemSchema = z.strictObject({
  kind: z.enum(['sale', 'refund']),
  number: z.string(),
  sale_id: z.uuid(),
  refund_id: z.uuid().nullable(),
  issued_at: wireDateTime,
  barbers: z.array(z.string()),
});

/** P4.RCP.04 answer — `{ items, next_cursor, total }` (API-DATA-08); `total` is always null here. */
export const receiptListPageSchema = z.strictObject({
  items: z.array(receiptListItemSchema),
  next_cursor: z.string().nullable(),
  total: z.int().nullable(),
});

/** P4.RCP.04 query — `date` default today, the 7-day range is checked against the clock. */
export const receiptListQuerySchema = listQuerySchema.extend({
  branch_id: z.uuid(),
  date: wireDate.optional(),
});

/** P4.RCP.03 query — the number as typed; the parsed value is the normalised number. */
export const receiptLookupQuerySchema = z.object({
  number: z.string().transform((text, ctx) => {
    const number = normalizeReceiptNumber(text);
    if (number === null) {
      ctx.addIssue({ code: 'custom', message: 'A receipt number is 1 – 40 characters' });
      return z.NEVER;
    }
    return number;
  }),
});

/** `ReceiptLookup` — P4.RCP.03: the receipt found by its number. */
export const receiptLookupSchema = z.strictObject({
  kind: z.enum(['sale', 'refund']),
  sale_id: z.uuid(),
  refund_id: z.uuid().nullable(),
  number: z.string(),
  branch_id: z.uuid(),
});

export type ReceiptListItemDto = z.infer<typeof receiptListItemSchema>;
export type ReceiptListPageDto = z.infer<typeof receiptListPageSchema>;
export type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>;
export type ReceiptLookupQuery = z.infer<typeof receiptLookupQuerySchema>;
export type ReceiptLookupDto = z.infer<typeof receiptLookupSchema>;
