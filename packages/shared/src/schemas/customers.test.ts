import { describe, expect, it } from 'vitest';

import {
  archiveNoteOf,
  customerArchiveSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerStatusSchema,
  customerUpdateSchema,
  normalizeCustomerMembers,
} from './customers.js';

// add-customer-management task 1.5 — the request schemas of design D4 and their limits (P3.CUS.01 /
// 03 / 05 / 06 / 07 · owner CM4 · proposal readings 18 / 19). Values from spec-fixtures §2: Ko Phyo
// `09 4500 1122`, Ma Su `+95977123456`.

type Issue = { readonly code: string; readonly path: readonly PropertyKey[]; [k: string]: unknown };

function issuesOf(schema: { safeParse(value: unknown): unknown }, value: unknown): Issue[] {
  const result = schema.safeParse(value) as
    { success: true } | { success: false; error: { issues: Issue[] } };
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues;
}

const KO_PHYO = { name: 'Ko Phyo', phone: '09 4500 1122' };
const T1 = '2026-10-05T09:10:00.000+06:30';

describe('customerCreateSchema — "Staff add a customer with a name and a phone"', () => {
  it('Scenario: Name and notes at their limits — 255 / 2,000 pass, 256 / 2,001 are too_big', () => {
    expect(customerCreateSchema.safeParse({ ...KO_PHYO, name: 'a'.repeat(255) }).success).toBe(
      true,
    );
    expect(issuesOf(customerCreateSchema, { ...KO_PHYO, name: 'a'.repeat(256) })).toMatchObject([
      { path: ['name'], code: 'too_big', maximum: 255 },
    ]);
    expect(customerCreateSchema.safeParse({ ...KO_PHYO, notes: 'n'.repeat(2000) }).success).toBe(
      true,
    );
    expect(issuesOf(customerCreateSchema, { ...KO_PHYO, notes: 'n'.repeat(2001) })).toMatchObject([
      { path: ['notes'], code: 'too_big', maximum: 2000 },
    ]);
  });

  it('Scenario: A blank name and a missing phone', () => {
    expect(issuesOf(customerCreateSchema, { ...KO_PHYO, name: '   ' })).toMatchObject([
      { path: ['name'], code: 'too_small', minimum: 1 },
    ]);
    expect(issuesOf(customerCreateSchema, { name: 'Ko Phyo' })).toMatchObject([
      { path: ['phone'], code: 'invalid_type' },
    ]);
  });

  it('the phone as typed: 50 characters pass, 51 are too_big', () => {
    expect(customerCreateSchema.safeParse({ name: 'x', phone: '9'.repeat(50) }).success).toBe(true);
    expect(issuesOf(customerCreateSchema, { name: 'x', phone: '9'.repeat(51) })).toMatchObject([
      { path: ['phone'], code: 'too_big', maximum: 50 },
    ]);
  });

  it('strips an unknown member — there is no e-mail (D-CUS-05)', () => {
    expect(customerCreateSchema.parse({ ...KO_PHYO, email: 'phyo@point.test' })).toStrictEqual(
      KO_PHYO,
    );
  });
});

describe('normalizeCustomerMembers — the members as stored (P3.CUS.03 / 05 · AD-FMT-10)', () => {
  it('Scenario: Myanmar digits are stored as 0–9', () => {
    const body = customerCreateSchema.parse({ name: ' Ko Phyo ', phone: ' ၀၉ ၄၅၀၀ ၁၁၂၂ ' });
    expect(normalizeCustomerMembers(body)).toStrictEqual({
      name: 'Ko Phyo',
      phone: '09 4500 1122',
    });
  });

  it('blank or null notes → null; an absent member stays absent', () => {
    const blank = customerUpdateSchema.parse({ notes: '   ', expected_updated_at: T1 });
    expect(normalizeCustomerMembers(blank)).toStrictEqual({ notes: null });
    const cleared = customerUpdateSchema.parse({ notes: null, expected_updated_at: T1 });
    expect(normalizeCustomerMembers(cleared)).toStrictEqual({ notes: null });
    const kept = customerUpdateSchema.parse({
      notes: ' Prefers a short fade ',
      expected_updated_at: T1,
    });
    expect(normalizeCustomerMembers(kept)).toStrictEqual({ notes: 'Prefers a short fade' });
  });
});

describe('customerUpdateSchema — "Staff with customer.update correct a customer"', () => {
  it('Scenario: The name cannot be removed — name: null is invalid_type', () => {
    expect(issuesOf(customerUpdateSchema, { name: null, expected_updated_at: T1 })).toMatchObject([
      { path: ['name'], code: 'invalid_type' },
    ]);
  });

  it('Scenario: Without the edit stamp — expected_updated_at is required', () => {
    expect(issuesOf(customerUpdateSchema, { notes: 'VIP' })).toMatchObject([
      { path: ['expected_updated_at'], code: 'invalid_type' },
    ]);
  });

  it('the edit stamp carries its offset', () => {
    expect(customerUpdateSchema.parse({ expected_updated_at: T1 })).toStrictEqual({
      expected_updated_at: T1,
    });
    expect(
      issuesOf(customerUpdateSchema, { expected_updated_at: '2026-10-05T09:10:00' }),
    ).toMatchObject([{ path: ['expected_updated_at'], code: 'invalid_format' }]);
  });
});

describe('customerStatusSchema and customerArchiveSchema (P3.CUS.06 / 07 · owner CM4)', () => {
  it('status 0 and 1 pass; 2 is refused at status', () => {
    expect(customerStatusSchema.parse({ status: 0 })).toStrictEqual({ status: 0 });
    expect(customerStatusSchema.parse({ status: 1 })).toStrictEqual({ status: 1 });
    expect(issuesOf(customerStatusSchema, { status: 2 })).toMatchObject([{ path: ['status'] }]);
  });

  it('the archive note: 500 characters pass, 501 are too_big; blank or absent → no reason', () => {
    expect(customerArchiveSchema.safeParse({ note: 'n'.repeat(500) }).success).toBe(true);
    expect(issuesOf(customerArchiveSchema, { note: 'n'.repeat(501) })).toMatchObject([
      { path: ['note'], code: 'too_big', maximum: 500 },
    ]);
    expect(archiveNoteOf(customerArchiveSchema.parse({ note: ' Moved away ' }))).toBe('Moved away');
    expect(archiveNoteOf(customerArchiveSchema.parse({ note: '  ' }))).toBeNull();
    expect(archiveNoteOf(customerArchiveSchema.parse({}))).toBeNull();
  });
});

describe('customerListQuerySchema — P3.CUS.01 (owner #7 · CM1 · reading 18)', () => {
  it('the defaults: ACTIVE only, no archived, last visit first, 25 a page', () => {
    expect(customerListQuerySchema.parse({})).toStrictEqual({
      status: [1],
      include_archived: false,
      sort: '-last_visit_at',
      limit: 25,
    });
  });

  it('Scenario: The status filter — one value or repeated', () => {
    expect(customerListQuerySchema.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(customerListQuerySchema.parse({ status: ['0', '1'] }).status).toStrictEqual([0, 1]);
  });

  it('Scenario: An unknown status — one issue at status, not at status[0]', () => {
    expect(issuesOf(customerListQuerySchema, { status: '2' })).toMatchObject([
      { path: ['status'], code: 'invalid_value' },
    ]);
    expect(issuesOf(customerListQuerySchema, { status: ['1', '2'] })).toMatchObject([
      { path: ['status'] },
    ]);
  });

  it('include_archived reads true and false, never "false" as true', () => {
    expect(customerListQuerySchema.parse({ include_archived: 'true' }).include_archived).toBe(true);
    expect(customerListQuerySchema.parse({ include_archived: 'false' }).include_archived).toBe(
      false,
    );
    expect(issuesOf(customerListQuerySchema, { include_archived: 'yes' })).toMatchObject([
      { path: ['include_archived'] },
    ]);
  });

  it('Scenario: An unknown sort key — sort=phone is refused at sort', () => {
    expect(customerListQuerySchema.parse({ sort: 'name' }).sort).toBe('name');
    expect(customerListQuerySchema.parse({ sort: '-created_at' }).sort).toBe('-created_at');
    expect(issuesOf(customerListQuerySchema, { sort: 'phone' })).toMatchObject([
      { path: ['sort'], code: 'invalid_value' },
    ]);
  });

  it('Scenario: The limit bounds — 1 and 100 pass, 0 is too_small, 101 too_big', () => {
    expect(customerListQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(customerListQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    expect(issuesOf(customerListQuerySchema, { limit: '0' })).toMatchObject([
      { path: ['limit'], code: 'too_small', minimum: 1 },
    ]);
    expect(issuesOf(customerListQuerySchema, { limit: '101' })).toMatchObject([
      { path: ['limit'], code: 'too_big', maximum: 100 },
    ]);
  });

  it('q: 255 characters pass, 256 are too_big', () => {
    expect(customerListQuerySchema.parse({ q: 'a'.repeat(255) }).q).toHaveLength(255);
    expect(issuesOf(customerListQuerySchema, { q: 'a'.repeat(256) })).toMatchObject([
      { path: ['q'], code: 'too_big', maximum: 255 },
    ]);
  });
});
