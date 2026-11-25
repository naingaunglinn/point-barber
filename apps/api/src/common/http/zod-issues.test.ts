import {
  catalogueCode,
  employeeCreateSchema,
  employeeStatusSchema,
  employeeUpdateSchema,
} from '@point/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toFieldErrors } from './zod-issues.js';

const schema = z.object({
  name: z.string().min(1),
  items: z
    .array(z.object({ quantity: z.number() }))
    .min(1)
    .max(3),
  phone: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, catalogueCode('phone_invalid'))
    .optional(),
});
const errors = (input: unknown) => toFieldErrors(schema.safeParse(input).error?.issues ?? []);

// API-ERR-02 · API-ERR-03 (Part 0 v1.6 — owner answer S5) · design D8.
describe('Zod issue → errors[] item', () => {
  it('writes array positions as [n] in a dotted path', () => {
    expect(errors({ name: 'Haircut', items: [{ quantity: 1 }, { quantity: 'two' }] })).toEqual([
      { field: 'items[1].quantity', code: 'invalid_type', params: { expected: 'number' } },
    ]);
  });

  it('keeps too_small with its minimum', () => {
    expect(errors({ name: '', items: [{ quantity: 1 }] })).toEqual([
      { field: 'name', code: 'too_small', params: { minimum: 1 } },
    ]);
  });

  it('keeps too_big with its maximum', () => {
    const four = [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }, { quantity: 1 }];
    expect(errors({ name: 'a', items: four })).toEqual([
      { field: 'items', code: 'too_big', params: { maximum: 3 } },
    ]);
  });

  it('lets a catalogue code named by the schema win, without params', () => {
    expect(errors({ name: 'a', items: [{ quantity: 1 }], phone: '12345' })).toEqual([
      { field: 'phone', code: 'phone_invalid' },
    ]);
  });

  it('maps a missing member to invalid_type, never to required', () => {
    expect(errors({ items: [{ quantity: 1 }] })).toEqual([
      { field: 'name', code: 'invalid_type', params: { expected: 'string' } },
    ]);
  });

  it('never returns a client-only code', () => {
    const codes = errors({}).map((e) => e.code);
    for (const clientOnly of ['required', 'date_invalid', 'unknown']) {
      expect(codes).not.toContain(clientOnly);
    }
  });
});

// add-employee-management task 1.2 — the field codes of the employee schemas (design D4): the Zod issue
// name unchanged, the params only where a message has a placeholder.
describe('employee field codes (add-employee-management task 1.2)', () => {
  const fields = (zodSchema: z.ZodType, input: unknown) =>
    toFieldErrors(zodSchema.safeParse(input).error?.issues ?? []);

  it('a rating that is not a step of 0.5 → not_multiple_of, with no params', () => {
    expect(fields(employeeUpdateSchema, { public_rating: 4.7 })).toEqual([
      { field: 'public_rating', code: 'not_multiple_of' },
    ]);
  });

  it('a rating outside 1 – 5 → too_small {minimum} / too_big {maximum}', () => {
    expect(fields(employeeUpdateSchema, { public_rating: 0.5 })).toEqual([
      { field: 'public_rating', code: 'too_small', params: { minimum: 1 } },
    ]);
    expect(fields(employeeUpdateSchema, { public_rating: 5.5 })).toEqual([
      { field: 'public_rating', code: 'too_big', params: { maximum: 5 } },
    ]);
  });

  it('a status outside 0 – 3 → invalid_value, with no params', () => {
    expect(fields(employeeStatusSchema, { status: 4 })).toEqual([
      { field: 'status', code: 'invalid_value' },
    ]);
  });

  it('a wrong e-mail address → the catalogue code email_invalid; a missing name → invalid_type', () => {
    expect(fields(employeeCreateSchema, { email: 'lin.point.test' })).toEqual([
      { field: 'email', code: 'email_invalid' },
      { field: 'name_mm', code: 'invalid_type', params: { expected: 'string' } },
    ]);
  });
});
