import { describe, expect, it } from 'vitest';

import { listQuerySchema } from './list-query.js';

const issue = (input: Record<string, unknown>) => listQuerySchema.safeParse(input).error?.issues[0];

// API-LIM-03 · API-DATA-08 — query values arrive as strings.
describe('listQuerySchema', () => {
  it('defaults an absent limit to 25', () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 25 });
  });

  it.each([
    ['1', 1],
    ['100', 100],
  ])('accepts limit=%s', (raw, limit) => {
    expect(listQuerySchema.parse({ limit: raw })).toEqual({ limit });
  });

  it('fails limit=0 with too_small, minimum 1', () => {
    expect(issue({ limit: '0' })).toMatchObject({ code: 'too_small', minimum: 1, path: ['limit'] });
  });

  it('fails limit=101 with too_big, maximum 100', () => {
    expect(issue({ limit: '101' })).toMatchObject({
      code: 'too_big',
      maximum: 100,
      path: ['limit'],
    });
  });

  it('fails limit=abc with invalid_type, expected number', () => {
    expect(issue({ limit: 'abc' })).toMatchObject({
      code: 'invalid_type',
      expected: 'number',
      path: ['limit'],
    });
  });

  // CG-API-03: request objects strip unknown members, so an older or newer app keeps working.
  it('drops an unknown member instead of failing', () => {
    expect(listQuerySchema.parse({ limit: '25', utm_source: 'x' })).toEqual({ limit: 25 });
  });

  it('accepts an optional non-empty cursor', () => {
    expect(listQuerySchema.parse({ cursor: 'abc' })).toEqual({ limit: 25, cursor: 'abc' });
    expect(listQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});
