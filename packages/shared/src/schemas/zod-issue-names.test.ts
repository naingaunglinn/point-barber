import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { catalogueCode } from './catalogue-code.js';

// add-branch-management task 1.2 — API-ERR-03 · CG-API-03 · design D4: `errors[].code` is the Zod
// issue name unchanged, so the names zod 4.6.5 gives each kind of branch rule are pinned here before
// the branch schemas use them. A zod upgrade that renames an issue fails this file first.

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a failure');
  return result.error.issues;
};

describe('zod 4.6.5 issue names of the branch rules (task 1.2)', () => {
  it('min / max on a trimmed string → too_small {minimum} / too_big {maximum}', () => {
    const name = z.string().trim().min(1).max(255);
    expect(issuesOf(name, '   ')).toMatchObject([{ code: 'too_small', minimum: 1 }]);
    expect(issuesOf(name, 'x'.repeat(256))).toMatchObject([{ code: 'too_big', maximum: 255 }]);
    expect(name.parse('  ပွိုင့် ၄.၀  ')).toBe('ပွိုင့် ၄.၀');
  });

  it('a failed regex → invalid_format', () => {
    expect(issuesOf(z.string().regex(/^[A-Z0-9]*$/), 'b4')).toMatchObject([
      { code: 'invalid_format', format: 'regex' },
    ]);
  });

  it('z.email() → invalid_format; with catalogueCode the message carries the catalogue code', () => {
    expect(issuesOf(z.email(), 'point4@')).toMatchObject([
      { code: 'invalid_format', format: 'email' },
    ]);
    expect(issuesOf(z.email(catalogueCode('email_invalid')), 'point4@')).toMatchObject([
      { code: 'invalid_format', message: 'code:email_invalid' },
    ]);
  });

  it('z.url({ protocol: /^https?$/ }) → invalid_format for javascript:, ftp: and a bare host', () => {
    const link = z.url({ protocol: /^https?$/ });
    for (const value of ['javascript:alert(1)', 'ftp://point.example', 'point4.example']) {
      expect(issuesOf(link, value)).toMatchObject([{ code: 'invalid_format', format: 'url' }]);
    }
    expect(link.parse('https://facebook.com/point3')).toBe('https://facebook.com/point3');
    expect(link.parse('http://point.example')).toBe('http://point.example');
  });

  it('a length check with abort runs before the URL check: one too_big issue only', () => {
    const link = z
      .string()
      .trim()
      .max(1000, { abort: true })
      .check(z.url({ protocol: /^https?$/ }));
    expect(issuesOf(link, `not a link ${'a'.repeat(1000)}`)).toMatchObject([
      { code: 'too_big', maximum: 1000 },
    ]);
    expect(issuesOf(link, `not a link ${'a'.repeat(1000)}`)).toHaveLength(1);
  });

  it('a missing member and a null member → invalid_type', () => {
    const body = z.object({ name_mm: z.string() });
    expect(issuesOf(body, {})).toMatchObject([{ code: 'invalid_type', path: ['name_mm'] }]);
    expect(issuesOf(body, { name_mm: null })).toMatchObject([
      { code: 'invalid_type', path: ['name_mm'] },
    ]);
  });

  it('z.int() on 50.5 → invalid_type; a number outside min / max → too_small / too_big', () => {
    const radius = z.int().min(10).max(2000);
    expect(issuesOf(radius, 50.5)).toMatchObject([{ code: 'invalid_type' }]);
    expect(issuesOf(radius, 9)).toMatchObject([{ code: 'too_small', minimum: 10 }]);
    expect(issuesOf(radius, 2001)).toMatchObject([{ code: 'too_big', maximum: 2000 }]);
  });

  it('an array above its maximum → too_big {maximum}', () => {
    expect(issuesOf(z.array(z.string()).max(10), Array(11).fill('x'))).toMatchObject([
      { code: 'too_big', maximum: 10 },
    ]);
  });

  it('a plain z.object strips an unknown member (CG-API-03)', () => {
    expect(z.object({ phone: z.string() }).parse({ code: 'B9', phone: '09 7700 0003' })).toEqual({
      phone: '09 7700 0003',
    });
  });
});
