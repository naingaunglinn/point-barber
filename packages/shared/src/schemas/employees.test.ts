import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  EMPLOYEE_SELF_VIEW_OMITTED,
  branchAssignSchema,
  branchEndSchema,
  employeeCreateSchema,
  employeeListQuerySchema,
  employeeSchema,
  employeeSelfViewSchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  normalizeEmployeeMembers,
  publicRatingSchema,
  revokeAllSchema,
  sessionSchema,
  toEmployeeView,
  userAccessSchema,
  type EmployeeDto,
} from './employees.js';

// add-employee-management tasks 1.5 / 1.6 — the request schemas with every limit of design D4 (each
// bound at the limit and one past it) and the strict response schemas (D6). Values from the brief's
// fixture additions: Ko Lin / ကိုလင်း, `lin@point.test`, `09 7800 0010`.

type Issue = { readonly code: string; readonly path: readonly PropertyKey[]; [k: string]: unknown };

function issuesOf(schema: z.ZodType, value: unknown): Issue[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map((issue) => ({ ...issue }));
}

const B1 = '0199a3f2-0000-7000-8001-0000000000b1';
const B3 = '0199a3f2-0000-7000-8001-0000000000b3';
const ROLE = '0199a3f2-0000-7000-8002-000000000001';
const LIN = { email: 'lin@point.test', name_mm: 'ကိုလင်း' };

describe('employeeCreateSchema (task 1.5)', () => {
  it('accepts the minimum, and Ko Lin with every member', () => {
    expect(employeeCreateSchema.parse(LIN)).toEqual(LIN);
    const full = {
      ...LIN,
      employee_code: 'E010',
      name_en: 'Ko Lin',
      phone: '09 7800 0010',
      join_date: '2026-10-05',
      internal_notes: null,
      branch_ids: [B3],
      role_assignments: [{ role_id: ROLE, scope_type: 2, branch_ids: [B3] }],
      send_invite: false,
    };
    expect(employeeCreateSchema.parse(full)).toEqual(full);
  });

  it('email and name_mm are required', () => {
    expect(issuesOf(employeeCreateSchema, {})).toMatchObject([
      { code: 'invalid_type', path: ['email'] },
      { code: 'invalid_type', path: ['name_mm'] },
    ]);
    expect(issuesOf(employeeCreateSchema, { email: null, name_mm: null })).toMatchObject([
      { code: 'invalid_type', path: ['email'] },
      { code: 'invalid_type', path: ['name_mm'] },
    ]);
  });

  it('email: trimmed, email_invalid for lin.point.test, 255 accepted and 256 too_big', () => {
    expect(employeeCreateSchema.parse({ ...LIN, email: '  lin@point.test  ' }).email).toBe(
      'lin@point.test',
    );
    expect(issuesOf(employeeCreateSchema, { ...LIN, email: 'lin.point.test' })).toMatchObject([
      { code: 'invalid_format', message: 'code:email_invalid', path: ['email'] },
    ]);
    expect(issuesOf(employeeCreateSchema, { ...LIN, email: '' })).toMatchObject([
      { message: 'code:email_invalid' },
    ]);
    const at255 = `${'a'.repeat(255 - '@point.test'.length)}@point.test`;
    expect(at255).toHaveLength(255);
    expect(employeeCreateSchema.safeParse({ ...LIN, email: at255 }).success).toBe(true);
    expect(issuesOf(employeeCreateSchema, { ...LIN, email: `a${at255}` })).toMatchObject([
      { code: 'too_big', maximum: 255, path: ['email'] },
    ]);
  });

  it('employee_code: 1 – 100 after trimming; null and absent are allowed on create', () => {
    for (const code of ['E', 'E'.repeat(100), null, undefined]) {
      expect(employeeCreateSchema.safeParse({ ...LIN, employee_code: code }).success).toBe(true);
    }
    expect(issuesOf(employeeCreateSchema, { ...LIN, employee_code: '   ' })).toMatchObject([
      { code: 'too_small', minimum: 1 },
    ]);
    expect(
      issuesOf(employeeCreateSchema, { ...LIN, employee_code: 'E'.repeat(101) }),
    ).toMatchObject([{ code: 'too_big', maximum: 100 }]);
    expect(employeeCreateSchema.parse({ ...LIN, employee_code: ' E010 ' }).employee_code).toBe(
      'E010',
    );
  });

  it('name_mm 1 – 255; name_en 255; phone 50; internal_notes 1,000 — each at the limit and one past', () => {
    const cases = [
      ['name_mm', 255],
      ['name_en', 255],
      ['phone', 50],
      ['internal_notes', 1000],
    ] as const;
    for (const [name, max] of cases) {
      expect(
        employeeCreateSchema.safeParse({ ...LIN, [name]: 'x'.repeat(max) }).success,
        name,
      ).toBe(true);
      expect(
        issuesOf(employeeCreateSchema, { ...LIN, [name]: 'x'.repeat(max + 1) }),
        name,
      ).toMatchObject([{ code: 'too_big', maximum: max, path: [name] }]);
    }
    expect(issuesOf(employeeCreateSchema, { ...LIN, name_mm: '  ' })).toMatchObject([
      { code: 'too_small', minimum: 1, path: ['name_mm'] },
    ]);
  });

  it('name_en, phone and internal_notes may be null; join_date is a date or null', () => {
    const nulls = { name_en: null, phone: null, internal_notes: null, join_date: null };
    expect(employeeCreateSchema.parse({ ...LIN, ...nulls })).toEqual({ ...LIN, ...nulls });
    expect(issuesOf(employeeCreateSchema, { ...LIN, join_date: '05/Oct/2026' })).toMatchObject([
      { path: ['join_date'] },
    ]);
  });

  it('branch_ids at 20 and 21; role_assignments at 10 and 11', () => {
    expect(employeeCreateSchema.safeParse({ ...LIN, branch_ids: Array(20).fill(B1) }).success).toBe(
      true,
    );
    expect(
      issuesOf(employeeCreateSchema, { ...LIN, branch_ids: Array(21).fill(B1) }),
    ).toMatchObject([{ code: 'too_big', maximum: 20, path: ['branch_ids'] }]);
    const item = { role_id: ROLE, scope_type: 1 };
    expect(
      employeeCreateSchema.safeParse({ ...LIN, role_assignments: Array(10).fill(item) }).success,
    ).toBe(true);
    expect(
      issuesOf(employeeCreateSchema, { ...LIN, role_assignments: Array(11).fill(item) }),
    ).toMatchObject([{ code: 'too_big', maximum: 10, path: ['role_assignments'] }]);
  });

  it('a role assignment needs a role and a scope of 1 or 2; its branch list is bounded', () => {
    expect(
      issuesOf(employeeCreateSchema, { ...LIN, role_assignments: [{ scope_type: 3 }] }),
    ).toMatchObject([
      { code: 'invalid_type', path: ['role_assignments', 0, 'role_id'] },
      { code: 'invalid_value', path: ['role_assignments', 0, 'scope_type'] },
    ]);
    expect(
      issuesOf(employeeCreateSchema, {
        ...LIN,
        role_assignments: [{ role_id: ROLE, scope_type: 2, branch_ids: Array(21).fill(B1) }],
      }),
    ).toMatchObject([{ code: 'too_big', maximum: 20 }]);
  });

  it('an unknown member is stripped (CG-API-03)', () => {
    expect(employeeCreateSchema.parse({ ...LIN, status: 1, user_id: B1 })).toEqual(LIN);
  });
});

describe('employeeUpdateSchema (task 1.5)', () => {
  it('an empty body is valid', () => {
    expect(employeeUpdateSchema.parse({})).toEqual({});
  });

  it('email, status and user_id are stripped', () => {
    expect(
      employeeUpdateSchema.parse({ email: 'x@point.test', status: 2, user_id: B1, phone: '09 1' }),
    ).toEqual({ phone: '09 1' });
  });

  it('name_mm, employee_code and public_profile cannot be null', () => {
    for (const name of ['name_mm', 'employee_code', 'public_profile']) {
      expect(issuesOf(employeeUpdateSchema, { [name]: null }), name).toMatchObject([
        { code: 'invalid_type', path: [name] },
      ]);
    }
  });

  it('the nullable members take null', () => {
    const nulls = {
      name_en: null,
      phone: null,
      join_date: null,
      internal_notes: null,
      photo_attachment_id: null,
      public_specialty_mm: null,
      public_specialty_en: null,
      public_rating: null,
      show_own_earnings: null,
    };
    expect(employeeUpdateSchema.parse(nulls)).toEqual(nulls);
  });

  it('specialty 200 and 201, notes 1,000 and 1,001', () => {
    for (const name of ['public_specialty_mm', 'public_specialty_en']) {
      expect(employeeUpdateSchema.safeParse({ [name]: 'x'.repeat(200) }).success).toBe(true);
      expect(issuesOf(employeeUpdateSchema, { [name]: 'x'.repeat(201) })).toMatchObject([
        { code: 'too_big', maximum: 200, path: [name] },
      ]);
    }
    expect(issuesOf(employeeUpdateSchema, { internal_notes: 'x'.repeat(1001) })).toMatchObject([
      { code: 'too_big', maximum: 1000 },
    ]);
  });

  it('the rating: 1.0, 5.0 and 4.5 pass; 0.5, 5.5 and 4.7 fail with their issue names', () => {
    for (const rating of [1, 1.5, 4.5, 5]) {
      expect(
        employeeUpdateSchema.safeParse({ public_rating: rating }).success,
        String(rating),
      ).toBe(true);
    }
    expect(issuesOf(employeeUpdateSchema, { public_rating: 0.5 })).toMatchObject([
      { code: 'too_small', minimum: 1 },
    ]);
    expect(issuesOf(employeeUpdateSchema, { public_rating: 5.5 })).toMatchObject([
      { code: 'too_big', maximum: 5 },
    ]);
    expect(issuesOf(employeeUpdateSchema, { public_rating: 4.7 })).toMatchObject([
      { code: 'not_multiple_of', path: ['public_rating'] },
    ]);
    expect(issuesOf(employeeUpdateSchema, { public_rating: '4.5' })).toMatchObject([
      { code: 'invalid_type' },
    ]);
  });

  it('expected_updated_at is an instant with its offset', () => {
    expect(
      employeeUpdateSchema.safeParse({ expected_updated_at: '2026-10-05T09:10:00.000+06:30' })
        .success,
    ).toBe(true);
    expect(issuesOf(employeeUpdateSchema, { expected_updated_at: '2026-10-05' })).toMatchObject([
      { path: ['expected_updated_at'] },
    ]);
  });
});

describe('normalizeEmployeeMembers (task 1.5)', () => {
  it('trims, turns a blank optional text into null and keeps an absent member absent', () => {
    const body = employeeUpdateSchema.parse({
      name_en: '   ',
      internal_notes: '',
      public_specialty_en: ' ',
      public_specialty_mm: 'ဆံပင်ညှပ်',
    });
    expect(normalizeEmployeeMembers(body)).toEqual({
      name_en: null,
      internal_notes: null,
      public_specialty_en: null,
      public_specialty_mm: 'ဆံပင်ညှပ်',
    });
  });

  it('writes the Myanmar digits of the phone as 0 – 9', () => {
    const body = employeeCreateSchema.parse({ ...LIN, phone: '၀၉ ၇၈၀၀ ၀၀၁၀' });
    expect(normalizeEmployeeMembers(body)).toEqual({ name_mm: 'ကိုလင်း', phone: '09 7800 0010' });
  });

  it('null stays null and a blank phone is null', () => {
    expect(normalizeEmployeeMembers(employeeUpdateSchema.parse({ phone: null }))).toEqual({
      phone: null,
    });
    expect(normalizeEmployeeMembers(employeeUpdateSchema.parse({ phone: '  ' }))).toEqual({
      phone: null,
    });
  });
});

describe('the small bodies (task 1.5)', () => {
  it('status: 0 – 3, a date for effective_date, reason 500 and 501', () => {
    for (const status of [0, 1, 2, 3]) {
      expect(employeeStatusSchema.safeParse({ status }).success).toBe(true);
    }
    expect(issuesOf(employeeStatusSchema, { status: 4 })).toMatchObject([
      { code: 'invalid_value', path: ['status'] },
    ]);
    expect(issuesOf(employeeStatusSchema, {})).toMatchObject([
      { code: 'invalid_value', path: ['status'] },
    ]);
    expect(employeeStatusSchema.safeParse({ status: 2, reason: 'x'.repeat(500) }).success).toBe(
      true,
    );
    expect(issuesOf(employeeStatusSchema, { status: 2, reason: 'x'.repeat(501) })).toMatchObject([
      { code: 'too_big', maximum: 500, path: ['reason'] },
    ]);
    expect(employeeStatusSchema.parse({ status: 2, effective_date: '2026-10-05' })).toEqual({
      status: 2,
      effective_date: '2026-10-05',
    });
  });

  it('assign needs a branch; end needs a last day', () => {
    expect(branchAssignSchema.parse({ branch_id: B3 })).toEqual({ branch_id: B3 });
    expect(branchAssignSchema.parse({ branch_id: B3, effective_from: '2026-10-05' })).toEqual({
      branch_id: B3,
      effective_from: '2026-10-05',
    });
    expect(issuesOf(branchAssignSchema, {})).toMatchObject([{ path: ['branch_id'] }]);
    expect(issuesOf(branchEndSchema, {})).toMatchObject([
      { code: 'invalid_type', path: ['effective_to'] },
    ]);
    expect(branchEndSchema.parse({ effective_to: '2026-10-05' })).toEqual({
      effective_to: '2026-10-05',
    });
  });

  it('the rating body requires public_rating (null allowed) and checks the step', () => {
    expect(publicRatingSchema.parse({ public_rating: 4.5 })).toEqual({ public_rating: 4.5 });
    expect(publicRatingSchema.parse({ public_rating: null })).toEqual({ public_rating: null });
    expect(issuesOf(publicRatingSchema, {})).toMatchObject([
      { code: 'invalid_type', path: ['public_rating'] },
    ]);
    expect(issuesOf(publicRatingSchema, { public_rating: 5.5 })).toMatchObject([
      { code: 'too_big' },
    ]);
    expect(issuesOf(publicRatingSchema, { public_rating: 4.7 })).toMatchObject([
      { code: 'not_multiple_of' },
    ]);
  });

  it('revoke-all: the reason is optional and at most 500', () => {
    expect(revokeAllSchema.parse({})).toEqual({});
    expect(revokeAllSchema.safeParse({ reason: 'x'.repeat(500) }).success).toBe(true);
    expect(issuesOf(revokeAllSchema, { reason: 'x'.repeat(501) })).toMatchObject([
      { code: 'too_big', maximum: 500 },
    ]);
  });
});

describe('employeeListQuerySchema (task 1.5)', () => {
  it('defaults: limit 25, sort name_mm, no filter', () => {
    expect(employeeListQuerySchema.parse({})).toEqual({ limit: 25, sort: 'name_mm' });
  });

  it('q ≤ 100; limit 1 – 100', () => {
    expect(employeeListQuerySchema.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
    expect(issuesOf(employeeListQuerySchema, { q: 'x'.repeat(101) })).toMatchObject([
      { code: 'too_big', maximum: 100 },
    ]);
    for (const limit of ['1', '100']) {
      expect(employeeListQuerySchema.safeParse({ limit }).success, limit).toBe(true);
    }
    for (const limit of ['0', '101']) {
      expect(employeeListQuerySchema.safeParse({ limit }).success, limit).toBe(false);
    }
  });

  it('status once or repeated becomes a list of codes; an unknown one is invalid_value', () => {
    expect(employeeListQuerySchema.parse({ status: '1' }).status).toEqual([1]);
    expect(employeeListQuerySchema.parse({ status: ['1', '2', '1'] }).status).toEqual([1, 2]);
    expect(issuesOf(employeeListQuerySchema, { status: ['1', '4'] })).toMatchObject([
      { code: 'invalid_value', path: ['status'] },
    ]);
  });

  it('login_status 0 – 2; sort one of the eight', () => {
    expect(employeeListQuerySchema.parse({ login_status: '2' }).login_status).toBe(2);
    expect(issuesOf(employeeListQuerySchema, { login_status: '3' })).toMatchObject([
      { code: 'invalid_value', path: ['login_status'] },
    ]);
    expect(employeeListQuerySchema.parse({ sort: '-employee_code' }).sort).toBe('-employee_code');
    expect(employeeListQuerySchema.safeParse({ sort: 'phone' }).success).toBe(false);
  });

  it('branch_id and role_id are uuids', () => {
    expect(employeeListQuerySchema.parse({ branch_id: B3, role_id: ROLE })).toMatchObject({
      branch_id: B3,
      role_id: ROLE,
    });
    expect(employeeListQuerySchema.safeParse({ branch_id: 'B3' }).success).toBe(false);
  });
});

// Ma Thida (E008): INVITED, no sign-in, B3 from 2026-09-01 (brief → fixture additions).
const MA_THIDA: EmployeeDto = {
  id: '0199a3f2-0000-7000-8003-000000000008',
  employee_code: 'E008',
  name_mm: 'မသီရိ',
  name_en: 'Ma Thida',
  photo_url: null,
  phone: null,
  join_date: '2026-09-01',
  status: 1,
  internal_notes: 'Joined from Point 2.0',
  public_profile: true,
  public_specialty_mm: null,
  public_specialty_en: null,
  public_rating: 4.5,
  show_own_earnings: null,
  effective_show_own_earnings: false,
  user: {
    id: '0199a3f2-0000-7000-8004-000000000008',
    email: 'thida@point.test',
    status: 2,
    ui_language: null,
    invited_at: '2026-09-01T09:00:00+06:30',
    invite_last_sent_at: null,
    activated_at: null,
    last_login_at: null,
    login_locked_until: null,
  },
  branches: [
    {
      id: '0199a3f2-0000-7000-8005-000000000008',
      branch: {
        id: B3,
        code: 'B3',
        name_mm: 'ပွိုင့် ၃.၀',
        name_en: 'Point 3.0',
        phone: null,
        status: 1,
        is_public: true,
      },
      effective_from: '2026-09-01',
      effective_to: null,
    },
  ],
  roles: [],
  sessions_count: 0,
  created_at: '2026-09-01T09:00:00+06:30',
  updated_at: '2026-09-01T09:00:00+06:30',
};

describe('the response schemas (task 1.6)', () => {
  it('Employee accepts the full view of Ma Thida', () => {
    expect(employeeSchema.parse(MA_THIDA)).toEqual(MA_THIDA);
  });

  it('Employee is strict: a member that is not listed fails', () => {
    expect(employeeSchema.safeParse({ ...MA_THIDA, password_hash: 'x' }).success).toBe(false);
    expect(
      employeeSchema.safeParse({ ...MA_THIDA, user: { ...MA_THIDA.user, google_sub: 'x' } })
        .success,
    ).toBe(false);
  });

  it('the rating keeps 1.0 – 5.0 in steps of 0.5; the specialty keeps 200', () => {
    expect(employeeSchema.safeParse({ ...MA_THIDA, public_rating: 4.7 }).success).toBe(false);
    expect(
      employeeSchema.safeParse({ ...MA_THIDA, public_specialty_mm: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('the self view omits internal_notes and show_own_earnings', () => {
    const self = toEmployeeView(MA_THIDA, { self: true });
    for (const member of EMPLOYEE_SELF_VIEW_OMITTED) expect(self).not.toHaveProperty(member);
    expect(employeeSelfViewSchema.parse(self)).toEqual(self);
    expect(employeeSelfViewSchema.safeParse(MA_THIDA).success).toBe(false);
    expect(toEmployeeView(MA_THIDA)).toEqual(MA_THIDA);
  });

  it('a member added to the mapper input never appears in the output', () => {
    const wider = { ...MA_THIDA, deleted_at: null, google_sub: 'sub-1', zawgyi_raw: 'x' };
    for (const self of [false, true]) {
      const view = toEmployeeView(wider as EmployeeDto, { self });
      expect(Object.keys(view).sort()).toStrictEqual(
        Object.keys(self ? toEmployeeView(MA_THIDA, { self: true }) : MA_THIDA).sort(),
      );
      expect(view).not.toHaveProperty('google_sub');
    }
  });

  it('UserAccess takes the three login statuses and is strict', () => {
    for (const status of [0, 1, 2]) {
      expect(userAccessSchema.safeParse({ ...MA_THIDA.user, status }).success).toBe(true);
    }
    expect(userAccessSchema.safeParse({ ...MA_THIDA.user, status: 3 }).success).toBe(false);
    expect(userAccessSchema.safeParse({ ...MA_THIDA.user, last_ip: '1.1.1.1' }).success).toBe(
      false,
    );
  });

  it('Session: the Android phone of Ko Aung (spec-fixtures)', () => {
    const phone = {
      id: '0199a3f2-0000-7000-8006-000000000001',
      device_label: 'Android · Chrome',
      login_method: 2,
      ip_address: '203.0.113.10',
      created_at: '2026-10-05T09:01:00+06:30',
      last_seen_at: '2026-10-05T09:20:00+06:30',
      is_current: true,
    };
    expect(sessionSchema.parse(phone)).toEqual(phone);
    expect(sessionSchema.safeParse({ ...phone, login_method: 3 }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...phone, token_hash: 'x' }).success).toBe(false);
  });
});
