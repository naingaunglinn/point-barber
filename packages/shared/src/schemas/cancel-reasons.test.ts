import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { CancelReasonStatus as Status, CancelReasonSystemCode } from '../constants/status.js';
import {
  CancelReasonLimits,
  cancelReasonCreateSchema as create,
  cancelReasonListQuerySchema as listQuery,
  cancelReasonListSchema,
  cancelReasonOrderSchema as order,
  cancelReasonSchema,
  cancelReasonUpdateSchema as update,
} from './cancel-reasons.js';

// add-booking-cancel-reasons task 2.1 — the P3.CRS schemas at each bound (P3.CRS.01 – 05 · API-ERR-03 ·
// CG-API-03 · design D6) and the spec scenarios they decide alone: "A new cancel reason is an active
// admin row placed last" (name length, no system code) and "A cancel reason is edited with its
// last-read time" (a missing `expected_updated_at`).

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.000+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';
const MAX = CancelReasonLimits.SORT_ORDER_MAX;

describe('cancelReasonCreateSchema (P3.CRS.02)', () => {
  it('Scenario: Placed after "Other" — requires_note false, sort_order left to the service', () => {
    const body = { name_mm: 'Customer နေမကောင်း', name_en: 'Customer is sick' };
    expect(create.parse(body)).toStrictEqual({ ...body, requires_note: false });
  });

  it('Scenario: A system code cannot be created — a sent system_code is stripped', () => {
    const body = { name_mm: 'မိုးရွာ', name_en: 'Heavy rain' };
    expect(create.parse({ ...body, system_code: CancelReasonSystemCode.NO_SHOW })).toStrictEqual({
      ...body,
      requires_note: false,
    });
  });

  it('Scenario: A reason that needs a note — requires_note and sort_order as sent', () => {
    const body = { name_mm: 'မိုးရွာ', requires_note: true, sort_order: 2 };
    expect(create.parse(body)).toStrictEqual(body);
  });

  it('Scenario: Name length at the limit and past it — 150 passes, 151 too_big, blank too_small', () => {
    expect(create.parse({ name_mm: 'မ'.repeat(150) }).name_mm).toHaveLength(150);
    expect(fails(create, { name_mm: 'မ'.repeat(151) })).toStrictEqual(['name_mm:too_big']);
    expect(fails(create, { name_mm: '   ' })).toStrictEqual(['name_mm:too_small']);
  });

  it('trims the names before the bounds; "Other " is "Other"', () => {
    expect(create.parse({ name_mm: 'Other ' }).name_mm).toBe('Other');
    expect(create.parse({ name_mm: ` ${'မ'.repeat(150)} ` }).name_mm).toHaveLength(150);
  });

  it('a missing or null Myanmar name is invalid_type', () => {
    expect(fails(create, {})).toStrictEqual(['name_mm:invalid_type']);
    expect(fails(create, { name_mm: null })).toStrictEqual(['name_mm:invalid_type']);
  });

  it('name_en: 150 or null pass, 151 is too_big', () => {
    expect(create.parse({ name_mm: 'x', name_en: 'P'.repeat(150) }).name_en).toHaveLength(150);
    expect(create.parse({ name_mm: 'x', name_en: null }).name_en).toBeNull();
    // A2 recorded reading — an empty or blank English name is null (AD-L10N-03).
    for (const blank of ['', '   ']) {
      expect(create.parse({ name_mm: 'x', name_en: blank }).name_en).toBeNull();
      expect(update.parse({ name_en: blank, expected_updated_at: AT }).name_en).toBeNull();
    }
    expect(create.parse({ name_mm: 'x', name_en: ' Other ' }).name_en).toBe('Other');
    expect(fails(create, { name_mm: 'x', name_en: 'P'.repeat(151) })).toStrictEqual([
      'name_en:too_big',
    ]);
  });

  it('sort_order: 0 and 2,147,483,647 pass; −1, 2,147,483,648 and 1.5 are refused', () => {
    for (const sortOrder of [0, MAX])
      expect(create.parse({ name_mm: 'x', sort_order: sortOrder }).sort_order).toBe(sortOrder);
    expect(fails(create, { name_mm: 'x', sort_order: -1 })).toStrictEqual(['sort_order:too_small']);
    expect(fails(create, { name_mm: 'x', sort_order: MAX + 1 })).toStrictEqual([
      'sort_order:too_big',
    ]);
    expect(fails(create, { name_mm: 'x', sort_order: 1.5 })).toStrictEqual([
      'sort_order:invalid_type',
    ]);
  });
});

describe('cancelReasonUpdateSchema (P3.CRS.03)', () => {
  it('Scenario: Rename and require a note — the members sent, nothing added', () => {
    const body = { name_en: 'Barber is busy', requires_note: true, expected_updated_at: AT };
    expect(update.parse(body)).toStrictEqual(body);
    expect(update.parse({ expected_updated_at: AT })).toStrictEqual({ expected_updated_at: AT });
  });

  it('a missing expected_updated_at is invalid_type; one without an offset invalid_format', () => {
    expect(fails(update, { name_en: 'Barber is busy' })).toStrictEqual([
      'expected_updated_at:invalid_type',
    ]);
    expect(fails(update, { expected_updated_at: '2026-10-05T10:00:00' })).toStrictEqual([
      'expected_updated_at:invalid_format',
    ]);
  });

  it('status 0 and 1 pass, 2 is refused', () => {
    for (const status of [Status.INACTIVE, Status.ACTIVE])
      expect(update.parse({ status, expected_updated_at: AT }).status).toBe(status);
    expect(fails(update, { status: 2, expected_updated_at: AT })).toStrictEqual([
      'status:invalid_value',
    ]);
  });

  it('the name bounds of the create apply', () => {
    expect(fails(update, { name_mm: ' ', expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_small',
    ]);
    expect(fails(update, { name_en: 'P'.repeat(151), expected_updated_at: AT })).toStrictEqual([
      'name_en:too_big',
    ]);
  });

  it('a sent system_code or sort_order is stripped', () => {
    expect(
      update.parse({ system_code: null, sort_order: 9, expected_updated_at: AT }),
    ).toStrictEqual({ expected_updated_at: AT });
  });
});

describe('cancelReasonOrderSchema (P3.CRS.05)', () => {
  it('takes the ids in order; empty is too_small, a non-UUID invalid_format', () => {
    expect(order.parse({ ids: [ID] })).toStrictEqual({ ids: [ID] });
    expect(fails(order, { ids: [] })).toStrictEqual(['ids:too_small']);
    expect(fails(order, { ids: [ID, 'other'] })).toStrictEqual(['ids.1:invalid_format']);
    expect(fails(order, {})).toStrictEqual(['ids:invalid_type']);
  });
});

describe('cancelReasonListQuerySchema (P3.CRS.01)', () => {
  it('without parameters: ACTIVE only, archived rows left out', () => {
    expect(listQuery.parse({})).toStrictEqual({ status: [Status.ACTIVE], include_archived: false });
  });

  it('Scenario: Inactive reasons are left out unless asked for — status=0, status=0&status=1', () => {
    expect(listQuery.parse({ status: '0' }).status).toStrictEqual([Status.INACTIVE]);
    expect(listQuery.parse({ status: ['0', '1'] }).status).toStrictEqual([
      Status.INACTIVE,
      Status.ACTIVE,
    ]);
  });

  it('status 2, a blank or a word is refused at status', () => {
    for (const status of ['2', '', 'x', ['1', '2']])
      expect(fails(listQuery, { status }).every((issue) => issue.startsWith('status'))).toBe(true);
  });

  it('include_archived reads true and false only', () => {
    expect(listQuery.parse({ include_archived: 'true' }).include_archived).toBe(true);
    expect(listQuery.parse({ include_archived: 'false' }).include_archived).toBe(false);
    expect(fails(listQuery, { include_archived: 'yes' })).toHaveLength(1);
  });
});

describe('cancelReasonSchema — the CancelReason DTO (Part 3 §11)', () => {
  const noShow = {
    id: ID,
    name_mm: 'Customer မလာ',
    name_en: 'Customer no-show',
    requires_note: false,
    system_code: CancelReasonSystemCode.NO_SHOW,
    sort_order: 3,
    status: Status.ACTIVE,
    archived_at: null,
    updated_at: AT,
  };

  it('holds the nine members of the OpenAPI schema; an admin row has system_code null', () => {
    expect(cancelReasonSchema.parse(noShow)).toStrictEqual(noShow);
    expect(cancelReasonSchema.parse({ ...noShow, system_code: null }).system_code).toBeNull();
    const items = [noShow, { ...noShow, archived_at: AT }];
    expect(cancelReasonListSchema.parse({ items }).items).toHaveLength(2);
  });

  it('is strict and knows only system code 1 and status 0 / 1', () => {
    for (const change of [{ company_id: ID }, { system_code: 2 }, { status: 2 }])
      expect(cancelReasonSchema.safeParse({ ...noShow, ...change }).success).toBe(false);
  });
});
