import { describe, expect, it } from 'vitest';

import { quoteRequestSchema } from './catalog.js';
import { customerLookupQuerySchema } from './customers.js';
import {
  completeRequestSchema,
  finishRequestSchema,
  myVisitsQuerySchema,
  paymentCreateSchema,
  reasonBodySchema,
  receiptQuerySchema,
  saleItemCreateSchema,
  startVisitRequestSchema,
} from './sales.js';

// add-walkin-visit-checkout task 2.6 — the request schemas hold only the members of design D12; an
// unknown member is stripped, never refused, so a client-sent price or total has no effect
// (API-DATA-02 · CG-API-03).
const B3 = '3f9a2c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const HAIRCUT = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const CASH = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('request schemas strip what this change does not build', () => {
  it('START keeps branch_id and items, drops performer, booking, location and price', () => {
    expect(
      startVisitRequestSchema.parse({
        branch_id: B3,
        items: [{ service_id: HAIRCUT, unit_price_amount: 1 }],
        performed_by_employee_id: CASH,
        booking_id: CASH,
        location_type: 2,
      }),
    ).toStrictEqual({ branch_id: B3, items: [{ service_id: HAIRCUT }] });
  });

  it('a line keeps line_type 1 and the service; a sent price or variant is dropped', () => {
    expect(
      saleItemCreateSchema.parse({
        line_type: 1,
        service_id: HAIRCUT,
        unit_price_amount: 1,
        service_variant_id: CASH,
        quantity: 3,
      }),
    ).toStrictEqual({ line_type: 1, service_id: HAIRCUT });
  });

  it('a PRODUCT line (2) is not a member value of this change', () => {
    expect(saleItemCreateSchema.safeParse({ line_type: 2, service_id: HAIRCUT }).success).toBe(
      false,
    );
  });

  it('a payment drops any unknown member', () => {
    expect(
      paymentCreateSchema.parse({ payment_method_id: CASH, amount: 10_000, total_amount: 1 }),
    ).toStrictEqual({ payment_method_id: CASH, amount: 10_000 });
  });

  it('FINISH drops a client total and an unknown customer member', () => {
    expect(
      finishRequestSchema.parse({
        expected_total_amount: 10_000,
        total_amount: 1,
        customer: { phone: '09 7712 3456', name: 'Ma Su', email: 'x' },
      }),
    ).toStrictEqual({
      expected_total_amount: 10_000,
      customer: { phone: '09 7712 3456', name: 'Ma Su' },
    });
  });
});

describe('amounts are whole MMK (D-PLT-04)', () => {
  it.each([1, 10_000, Number.MAX_SAFE_INTEGER])('payment amount %d is accepted', (amount) => {
    expect(paymentCreateSchema.safeParse({ payment_method_id: CASH, amount }).success).toBe(true);
  });

  it.each([0, -1, 1.5, '10000', Number.MAX_SAFE_INTEGER + 1])(
    'payment amount %s is refused',
    (amount) => {
      expect(paymentCreateSchema.safeParse({ payment_method_id: CASH, amount }).success).toBe(
        false,
      );
    },
  );

  it('expected_total_amount may be 0 and not negative or fractional', () => {
    expect(finishRequestSchema.safeParse({ expected_total_amount: 0 }).success).toBe(true);
    expect(finishRequestSchema.safeParse({ expected_total_amount: -1 }).success).toBe(false);
    expect(finishRequestSchema.safeParse({ expected_total_amount: 0.5 }).success).toBe(false);
  });
});

describe('reasons are at most 1,000 characters (API-DATA-11)', () => {
  it('1,000 characters are accepted and 1,001 refused with too_big', () => {
    expect(reasonBodySchema.safeParse({ reason: 'က'.repeat(1000) }).success).toBe(true);
    const result = reasonBodySchema.safeParse({ reason: 'က'.repeat(1001) });
    expect(result.error?.issues.map((issue) => [issue.path, issue.code])).toStrictEqual([
      [['reason'], 'too_big'],
    ]);
  });

  it('the same bound holds for added_reason and override_reason', () => {
    const long = 'x'.repeat(1001);
    expect(
      saleItemCreateSchema.safeParse({ line_type: 1, service_id: HAIRCUT, added_reason: long })
        .success,
    ).toBe(false);
    expect(
      finishRequestSchema.safeParse({ expected_total_amount: 0, override_reason: long }).success,
    ).toBe(false);
  });

  it('a blank or missing reason passes the schema; the service answers reason_required', () => {
    expect(reasonBodySchema.parse({ reason: '   ' })).toStrictEqual({ reason: '   ' });
    expect(reasonBodySchema.parse({})).toStrictEqual({});
  });
});

describe('quote request (P2.PRC.06)', () => {
  const item = { service_id: HAIRCUT };
  const body = { branch_id: B3, location_type: 1, date: '2026-10-05', items: [item] };

  it('takes 1 to 20 items with their variant key', () => {
    expect(
      quoteRequestSchema.parse({ ...body, items: [{ ...item, service_variant_id: null }] }),
    ).toStrictEqual({ ...body, items: [{ ...item, service_variant_id: null }] });
    expect(quoteRequestSchema.safeParse({ ...body, items: Array(20).fill(item) }).success).toBe(
      true,
    );
    expect(quoteRequestSchema.safeParse({ ...body, items: [] }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...body, items: Array(21).fill(item) }).success).toBe(
      false,
    );
  });

  it('takes the locations 1 BRANCH and 2 HOME only, and a calendar date', () => {
    expect(quoteRequestSchema.safeParse({ ...body, location_type: 2 }).success).toBe(true);
    expect(quoteRequestSchema.safeParse({ ...body, location_type: 3 }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...body, date: '05/10/2026' }).success).toBe(false);
  });
});

describe('query schemas of the walk-in reads', () => {
  it('my visits: status repeatable or single, a business date, nothing = the default', () => {
    expect(myVisitsQuerySchema.parse({ status: ['1', '2'] })).toStrictEqual({ status: [1, 2] });
    expect(myVisitsQuerySchema.parse({ status: '3', date: '2026-10-05' })).toStrictEqual({
      status: [3],
      date: '2026-10-05',
    });
    expect(myVisitsQuerySchema.parse({})).toStrictEqual({});
    expect(myVisitsQuerySchema.safeParse({ status: '4' }).success).toBe(false);
    expect(myVisitsQuerySchema.safeParse({ date: '05/10/2026' }).success).toBe(false);
  });

  it('receipt: format json by default, pdf or png; width 58 or 80 only', () => {
    expect(receiptQuerySchema.parse({})).toStrictEqual({ format: 'json' });
    expect(receiptQuerySchema.parse({ format: 'pdf', width: '80' })).toStrictEqual({
      format: 'pdf',
      width: 80,
    });
    expect(receiptQuerySchema.safeParse({ format: 'html' }).success).toBe(false);
    expect(receiptQuerySchema.safeParse({ width: '70' }).success).toBe(false);
  });

  it('customer lookup: the phone as typed is required', () => {
    expect(customerLookupQuerySchema.parse({ phone: '09 7712 3456' })).toStrictEqual({
      phone: '09 7712 3456',
    });
    expect(customerLookupQuerySchema.safeParse({}).success).toBe(false);
  });
});

// add-late-entry task 1.4 — the late-entry members of the Part 4 OpenAPI schemas `LateEntry`,
// `CompleteRequest`, `PaymentCreate.received_at` and `FinishRequest.finished_at` (design D1 · P4.VIS.03
// · P4.VIS.05 · P4.PAY.02 · P4.SAL.10). Whether a time is required depends on the stored visit, so a
// missing one passes here and the service answers 400.
describe('late-entry members (add-late-entry)', () => {
  const lateEntry = { reason: 1, started_at: '2026-10-04T15:00:00+06:30' };

  it('START keeps late_entry with its reason, note and start time', () => {
    expect(
      startVisitRequestSchema.parse({
        branch_id: B3,
        late_entry: { ...lateEntry, reason: 9, note: 'Paper slip', extra: 1 },
      }),
    ).toStrictEqual({
      branch_id: B3,
      late_entry: { reason: 9, note: 'Paper slip', started_at: '2026-10-04T15:00:00+06:30' },
    });
    expect(startVisitRequestSchema.parse({ branch_id: B3, late_entry: null })).toStrictEqual({
      branch_id: B3,
      late_entry: null,
    });
  });

  it.each([1, 2, 3, 4, 9])('reason %d is accepted', (reason) => {
    expect(
      startVisitRequestSchema.safeParse({ branch_id: B3, late_entry: { ...lateEntry, reason } })
        .success,
    ).toBe(true);
  });

  it.each([0, 5, 8, 10, '1'])('reason %s is refused', (reason) => {
    expect(
      startVisitRequestSchema.safeParse({ branch_id: B3, late_entry: { ...lateEntry, reason } })
        .success,
    ).toBe(false);
  });

  it('the note holds 1,000 characters and refuses 1,001 with too_big', () => {
    const parse = (note: string) =>
      startVisitRequestSchema.safeParse({ branch_id: B3, late_entry: { ...lateEntry, note } });
    expect(parse('က'.repeat(1000)).success).toBe(true);
    expect(parse('က'.repeat(1001)).error?.issues.map((i) => [i.path, i.code])).toStrictEqual([
      [['late_entry', 'note'], 'too_big'],
    ]);
  });

  it("a blank note passes the schema; OTHER without a note is the service's reason_required", () => {
    expect(
      startVisitRequestSchema.parse({
        branch_id: B3,
        late_entry: { ...lateEntry, reason: 9, note: '  ' },
      }).late_entry?.note,
    ).toBe('  ');
  });

  it('started_at is required inside late_entry, named by its path', () => {
    const result = startVisitRequestSchema.safeParse({ branch_id: B3, late_entry: { reason: 1 } });
    expect(result.error?.issues.map((issue) => issue.path)).toStrictEqual([
      ['late_entry', 'started_at'],
    ]);
  });

  it.each([
    ['2026-10-04T08:30:00+00:00', '2026-10-04T15:00:00+06:30'],
    ['2026-10-04T08:30:00Z', '2026-10-04T15:00:00+06:30'],
    ['2026-10-04T17:00:00+08:00', '2026-10-04T15:30:00+06:30'],
  ])('a time of any offset is normalised: %s → %s (API-DATA-03)', (sent, stored) => {
    expect(
      startVisitRequestSchema.parse({
        branch_id: B3,
        late_entry: { ...lateEntry, started_at: sent },
      }).late_entry?.started_at,
    ).toBe(stored);
    expect(completeRequestSchema.parse({ completed_at: sent })).toStrictEqual({
      completed_at: stored,
    });
    expect(
      paymentCreateSchema.parse({ payment_method_id: CASH, amount: 1, received_at: sent })
        .received_at,
    ).toBe(stored);
    expect(
      finishRequestSchema.parse({ expected_total_amount: 0, finished_at: sent }).finished_at,
    ).toBe(stored);
  });

  it.each([
    '2026-10-04',
    '2026-10-04T15:00:00',
    // RFC 3339 date-time needs the seconds.
    '2026-10-04T15:00+06:30',
    '04/Oct/2026 3:00 PM',
    1_728_032_400_000,
  ])('a time without an offset, or not a time, is refused: %s', (sent) => {
    expect(completeRequestSchema.safeParse({ completed_at: sent }).success).toBe(false);
    expect(
      startVisitRequestSchema.safeParse({
        branch_id: B3,
        late_entry: { ...lateEntry, started_at: sent },
      }).success,
    ).toBe(false);
  });

  it('the three later times are optional and nullable', () => {
    expect(completeRequestSchema.parse({})).toStrictEqual({});
    expect(completeRequestSchema.parse({ completed_at: null })).toStrictEqual({
      completed_at: null,
    });
    expect(
      paymentCreateSchema.parse({ payment_method_id: CASH, amount: 1, received_at: null }),
    ).toStrictEqual({ payment_method_id: CASH, amount: 1, received_at: null });
    expect(
      finishRequestSchema.parse({ expected_total_amount: 0, finished_at: null }),
    ).toStrictEqual({ expected_total_amount: 0, finished_at: null });
  });
});
