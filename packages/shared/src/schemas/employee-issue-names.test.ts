import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { catalogueCode } from './catalogue-code.js';

// add-employee-management task 1.2 — API-ERR-03 · design D4: `errors[].code` is the Zod issue name
// unchanged, so the name and params each rule of the employee schemas gives under the installed zod
// (4.6.5) are pinned here before the schemas use them. A zod upgrade that renames an issue fails this
// file first.

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a failure');
  return result.error.issues;
};

describe('zod 4.6.5 issue names of the employee rules (task 1.2)', () => {
  it('string min / max → too_small {minimum} / too_big {maximum}', () => {
    const code = z.string().trim().min(1).max(100);
    expect(issuesOf(code, '   ')).toMatchObject([{ code: 'too_small', minimum: 1 }]);
    expect(issuesOf(code, 'E'.repeat(101))).toMatchObject([{ code: 'too_big', maximum: 100 }]);
    expect(code.parse('E'.repeat(100))).toHaveLength(100);
  });

  it('z.email() with catalogueCode → invalid_format carrying email_invalid', () => {
    const email = z
      .string()
      .trim()
      .max(255, { abort: true })
      .check(z.email(catalogueCode('email_invalid')));
    expect(issuesOf(email, 'lin.point.test')).toMatchObject([
      { code: 'invalid_format', format: 'email', message: 'code:email_invalid' },
    ]);
    expect(issuesOf(email, `${'a'.repeat(250)}@x.test`)).toMatchObject([
      { code: 'too_big', maximum: 255 },
    ]);
    expect(email.parse('  lin@point.test ')).toBe('lin@point.test');
  });

  it('a missing member and a null member → invalid_type', () => {
    const body = z.object({ email: z.string(), name_mm: z.string() });
    expect(issuesOf(body, { name_mm: 'ကိုလင်း' })).toMatchObject([
      { code: 'invalid_type', path: ['email'] },
    ]);
    expect(issuesOf(body, { email: 'a@b.test', name_mm: null })).toMatchObject([
      { code: 'invalid_type', path: ['name_mm'] },
    ]);
  });

  it('a status outside its literals → invalid_value {values}', () => {
    const status = z.literal([0, 1, 2, 3]);
    expect(issuesOf(status, 4)).toMatchObject([{ code: 'invalid_value', values: [0, 1, 2, 3] }]);
    expect(issuesOf(status, 'x')).toMatchObject([{ code: 'invalid_value' }]);
  });

  it('the rating min(1) / max(5) / multipleOf(0.5) → too_small / too_big / not_multiple_of', () => {
    const rating = z.number().min(1).max(5).multipleOf(0.5);
    expect(issuesOf(rating, 0.5)).toMatchObject([{ code: 'too_small', minimum: 1 }]);
    expect(issuesOf(rating, 5.5)).toMatchObject([{ code: 'too_big', maximum: 5 }]);
    expect(issuesOf(rating, 4.7)).toMatchObject([{ code: 'not_multiple_of', divisor: 0.5 }]);
    for (const ok of [1, 1.5, 4.5, 5]) expect(rating.parse(ok)).toBe(ok);
  });

  it('an array above its maximum → too_big {maximum}', () => {
    const branchId = '0199a3f2-0000-7000-8001-0000000000b3';
    expect(issuesOf(z.array(z.uuid()).max(20), Array(21).fill(branchId))).toMatchObject([
      { code: 'too_big', maximum: 20 },
    ]);
    expect(issuesOf(z.array(z.string()).max(10), Array(11).fill('x'))).toMatchObject([
      { code: 'too_big', maximum: 10 },
    ]);
  });
});
