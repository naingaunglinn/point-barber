import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { LeaveTypeStatus } from '../constants/status.js';
import {
  LeaveTypeLimits,
  leaveTypeCreateSchema,
  leaveTypeSchema,
  leaveTypeUpdateSchema,
  leaveTypesQuerySchema,
} from './leave-types.js';

// add-leave-types task 1.4 — the limits and field codes of design D4 (API-ERR-03 · CG-API-03): spec
// "Create a leave type" and "Edit a leave type with optimistic concurrency". `errors[].code` is the
// Zod issue name, so the names are pinned here.

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a failure');
  return result.error.issues;
};

const TRAINING = 'သင်တန်းခွင့်';
const EXPECTED = '2026-10-05T09:30:00.000+06:30';
const create = (members: Record<string, unknown>) =>
  leaveTypeCreateSchema.safeParse({ name_mm: TRAINING, is_paid: true, ...members });

describe('add-leave-types · leave · leave-type create schema (task 1.4)', () => {
  it('name_mm: 100 characters pass, 101 → too_big {maximum 100}, blank → too_small {minimum 1}', () => {
    expect(LeaveTypeLimits.NAME_MAX).toBe(100);
    expect(create({ name_mm: 'က'.repeat(100) }).data?.name_mm).toHaveLength(100);
    expect(
      issuesOf(leaveTypeCreateSchema, { name_mm: 'က'.repeat(101), is_paid: true }),
    ).toMatchObject([{ code: 'too_big', maximum: 100, path: ['name_mm'] }]);
    expect(issuesOf(leaveTypeCreateSchema, { name_mm: '   ', is_paid: true })).toMatchObject([
      { code: 'too_small', minimum: 1, path: ['name_mm'] },
    ]);
    expect(create({ name_mm: `  ${TRAINING}  ` }).data?.name_mm).toBe(TRAINING);
  });

  it('name_en: blank → null, trimmed, absent stays absent, 101 → too_big {maximum 100}', () => {
    expect(create({ name_en: '  ' }).data?.name_en).toBeNull();
    expect(create({ name_en: ' Training ' }).data?.name_en).toBe('Training');
    expect(create({ name_en: null }).data?.name_en).toBeNull();
    expect(create({}).data).toStrictEqual({ name_mm: TRAINING, is_paid: true });
    expect(
      issuesOf(leaveTypeCreateSchema, {
        name_mm: TRAINING,
        name_en: 'x'.repeat(101),
        is_paid: true,
      }),
    ).toMatchObject([{ code: 'too_big', maximum: 100, path: ['name_en'] }]);
  });

  it('is_paid missing → invalid_type; a text is not a boolean', () => {
    expect(issuesOf(leaveTypeCreateSchema, { name_mm: TRAINING })).toMatchObject([
      { code: 'invalid_type', path: ['is_paid'] },
    ]);
    expect(issuesOf(leaveTypeCreateSchema, { name_mm: TRAINING, is_paid: 'true' })).toMatchObject([
      { code: 'invalid_type', path: ['is_paid'] },
    ]);
  });

  it('sort_order: any 32-bit integer; 2,147,483,648 and 1.5 refused', () => {
    expect(create({ sort_order: 2_147_483_647 }).data?.sort_order).toBe(2_147_483_647);
    expect(create({ sort_order: -2_147_483_648 }).data?.sort_order).toBe(-2_147_483_648);
    expect(
      issuesOf(leaveTypeCreateSchema, {
        name_mm: TRAINING,
        is_paid: true,
        sort_order: 2_147_483_648,
      }),
    ).toMatchObject([{ code: 'too_big', path: ['sort_order'] }]);
    expect(
      issuesOf(leaveTypeCreateSchema, {
        name_mm: TRAINING,
        is_paid: true,
        sort_order: -2_147_483_649,
      }),
    ).toMatchObject([{ code: 'too_small', path: ['sort_order'] }]);
    expect(
      issuesOf(leaveTypeCreateSchema, { name_mm: TRAINING, is_paid: true, sort_order: 1.5 }),
    ).toMatchObject([{ code: 'invalid_type', path: ['sort_order'] }]);
  });

  it('strips an unknown member (CG-API-03)', () => {
    expect(create({ status: 0 }).data).toStrictEqual({ name_mm: TRAINING, is_paid: true });
  });
});

describe('add-leave-types · leave · leave-type update schema (task 1.4)', () => {
  it('without expected_updated_at → invalid_type; with it, every other member is optional', () => {
    expect(issuesOf(leaveTypeUpdateSchema, { is_paid: false })).toMatchObject([
      { code: 'invalid_type', path: ['expected_updated_at'] },
    ]);
    expect(leaveTypeUpdateSchema.parse({ expected_updated_at: EXPECTED })).toStrictEqual({
      expected_updated_at: EXPECTED,
    });
    expect(
      leaveTypeUpdateSchema.parse({ name_en: 'Training course', expected_updated_at: EXPECTED }),
    ).toStrictEqual({ name_en: 'Training course', expected_updated_at: EXPECTED });
  });

  it('expected_updated_at is an instant with its offset', () => {
    expect(
      issuesOf(leaveTypeUpdateSchema, { expected_updated_at: '2026-10-05T09:30:00.000' }),
    ).toMatchObject([{ code: 'invalid_format', path: ['expected_updated_at'] }]);
  });

  it('status 0 or 1; 2 refused; name_mm null and blank refused; name_en blank → null', () => {
    expect(
      leaveTypeUpdateSchema.parse({
        status: LeaveTypeStatus.INACTIVE,
        expected_updated_at: EXPECTED,
      }).status,
    ).toBe(0);
    expect(
      issuesOf(leaveTypeUpdateSchema, { status: 2, expected_updated_at: EXPECTED }),
    ).toMatchObject([{ path: ['status'] }]);
    expect(
      issuesOf(leaveTypeUpdateSchema, { name_mm: null, expected_updated_at: EXPECTED }),
    ).toMatchObject([{ code: 'invalid_type', path: ['name_mm'] }]);
    expect(
      issuesOf(leaveTypeUpdateSchema, { name_mm: ' ', expected_updated_at: EXPECTED }),
    ).toMatchObject([{ code: 'too_small', minimum: 1, path: ['name_mm'] }]);
    expect(
      leaveTypeUpdateSchema.parse({ name_en: ' ', expected_updated_at: EXPECTED }).name_en,
    ).toBeNull();
  });
});

describe('add-leave-types · leave · leave-type list query (task 1.4)', () => {
  it('status defaults to [1] ACTIVE; include_archived to false', () => {
    expect(leaveTypesQuerySchema.parse({})).toStrictEqual({
      status: [LeaveTypeStatus.ACTIVE],
      include_archived: false,
    });
  });

  it('status is repeatable: ?status=0 → [0], ?status=0&status=1 → [0, 1]', () => {
    expect(leaveTypesQuerySchema.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(leaveTypesQuerySchema.parse({ status: ['0', '1'] }).status).toStrictEqual([0, 1]);
  });

  it('status=2, a blank status and a word are refused', () => {
    for (const status of ['2', '', 'active', ['1', '2']]) {
      expect(issuesOf(leaveTypesQuerySchema, { status })[0]?.path[0]).toBe('status');
    }
  });

  it("include_archived: 'true' → true, 'false' → false, anything else refused", () => {
    expect(leaveTypesQuerySchema.parse({ include_archived: 'true' }).include_archived).toBe(true);
    expect(leaveTypesQuerySchema.parse({ include_archived: 'false' }).include_archived).toBe(false);
    for (const value of ['', 'maybe', ['true', 'false']]) {
      expect(issuesOf(leaveTypesQuerySchema, { include_archived: value })[0]?.path).toStrictEqual([
        'include_archived',
      ]);
    }
  });
});

// add-leave-types task 1.5 — the OpenAPI `LeaveType` (P2.LVT.01 · API-DATA-03 · design D4 / D6).
describe('add-leave-types · leave · LeaveType response schema (task 1.5)', () => {
  const training = {
    id: '0199a3f2-0000-7000-8010-000000000004',
    name_mm: TRAINING,
    name_en: 'Training',
    is_paid: true,
    sort_order: 4,
    status: LeaveTypeStatus.ACTIVE,
    archived_at: null,
    updated_at: EXPECTED,
  };

  it('holds the eight members; archived_at is an instant or null', () => {
    expect(leaveTypeSchema.parse(training)).toStrictEqual(training);
    const archived = { ...training, archived_at: '2026-10-05T10:00:00+06:30' };
    expect(leaveTypeSchema.parse(archived)).toStrictEqual(archived);
  });

  it('is strict: a member more or a member less is refused', () => {
    expect(leaveTypeSchema.safeParse({ ...training, company_id: training.id }).success).toBe(false);
    const { archived_at: _archived, ...withoutArchived } = training;
    expect(leaveTypeSchema.safeParse(withoutArchived).success).toBe(false);
  });
});
