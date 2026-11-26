import { describe, expect, it } from 'vitest';

import {
  receiptListItemSchema,
  receiptListQuerySchema,
  receiptLookupQuerySchema,
  receiptLookupSchema,
} from './receipts.js';

// add-receipts-list-lookup task 1.2 — the list item is strict (AD-PERM-05), the queries refuse what
// P4.RCP.03 / 04 refuse.
const B3 = '3f9a2c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const SALE = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const item = {
  kind: 'sale',
  number: 'B3-2026-OCT-00001',
  sale_id: SALE,
  refund_id: null,
  issued_at: '2026-10-05T10:42:00+06:30',
  barbers: ['Ko Aung'],
};

describe('receiptListItemSchema', () => {
  it('has exactly the six members of the contract', () => {
    expect(Object.keys(receiptListItemSchema.parse(item)).sort()).toStrictEqual([
      'barbers',
      'issued_at',
      'kind',
      'number',
      'refund_id',
      'sale_id',
    ]);
  });

  it('an extra total_amount member fails', () => {
    expect(receiptListItemSchema.safeParse({ ...item, total_amount: 10_000 }).success).toBe(false);
  });
});

describe('receiptListQuerySchema', () => {
  it('needs a UUID branch_id and defaults the limit to 25', () => {
    expect(receiptListQuerySchema.parse({ branch_id: B3 })).toMatchObject({ limit: 25 });
    expect(receiptListQuerySchema.safeParse({}).success).toBe(false);
    expect(receiptListQuerySchema.safeParse({ branch_id: 'B3' }).success).toBe(false);
  });

  it.each(['0', '101'])('limit %s is refused', (limit) => {
    expect(receiptListQuerySchema.safeParse({ branch_id: B3, limit }).success).toBe(false);
  });

  it('date is YYYY-MM-DD', () => {
    expect(receiptListQuerySchema.parse({ branch_id: B3, date: '2026-09-28' }).date).toBe(
      '2026-09-28',
    );
    expect(receiptListQuerySchema.safeParse({ branch_id: B3, date: '2026-10-5' }).success).toBe(
      false,
    );
  });
});

describe('receiptLookupQuerySchema', () => {
  it('parses to the normalised number', () => {
    expect(receiptLookupQuerySchema.parse({ number: ' b3-၂၀၂၆-oct-၀၀၀၀၁ ' }).number).toBe(
      'B3-2026-OCT-00001',
    );
  });

  it.each([{ number: '' }, { number: 'A'.repeat(41) }, {}])('%j is refused', (query) => {
    const result = receiptLookupQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toStrictEqual(['number']);
  });
});

describe('receiptLookupSchema', () => {
  it('is strict', () => {
    const found = { kind: 'sale', sale_id: SALE, refund_id: null, number: 'X', branch_id: B3 };
    expect(receiptLookupSchema.safeParse(found).success).toBe(true);
    expect(receiptLookupSchema.safeParse({ ...found, total_amount: 1 }).success).toBe(false);
  });
});
