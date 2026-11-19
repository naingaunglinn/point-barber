import { describe, expect, it } from 'vitest';

import { problemSchema } from './problem.js';

// API-ERR-01 · OpenAPI Part 1 `Problem` (required: title, status, code, request_id).
const notFound = {
  type: 'https://point.test/errors/not_found',
  title: 'Not found',
  status: 404,
  code: 'not_found',
  request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
};

describe('problemSchema', () => {
  it('accepts the not-found body of the spec', () => {
    expect(problemSchema.parse(notFound)).toEqual(notFound);
  });

  it('accepts field errors and a context', () => {
    const body = {
      ...notFound,
      status: 400,
      code: 'validation',
      errors: [
        { field: 'items[1].quantity', code: 'invalid_type', params: { expected: 'number' } },
      ],
      context: { branch_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e71' },
    };
    expect(problemSchema.parse(body)).toEqual(body);
  });

  it.each(['title', 'status', 'code', 'request_id'])('requires %s', (member) => {
    const body: Record<string, unknown> = { ...notFound };
    delete body[member];
    expect(problemSchema.safeParse(body).success).toBe(false);
  });

  it('requires request_id to be a UUID', () => {
    expect(problemSchema.safeParse({ ...notFound, request_id: 'sale-42' }).success).toBe(false);
  });

  // API-ERR-02: login_locked (`until`), session_revoked (`reason`), rate_limited (`retry_after`).
  it.each([
    { code: 'login_locked', status: 401, until: '2026-10-01T15:25:00+06:30' },
    { code: 'session_revoked', status: 401, reason: 4 },
    { code: 'rate_limited', status: 429, retry_after: 900 },
  ])('accepts the extension member of $code', (member) => {
    const body = { ...notFound, ...member };
    expect(problemSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['until without an offset', { until: '2026-10-01T15:25:00' }],
    ['a fractional retry_after', { retry_after: 1.5 }],
    ['a zero retry_after', { retry_after: 0 }],
    ['a text reason', { reason: 'logout' }],
  ])('refuses %s', (_, member) => {
    expect(problemSchema.safeParse({ ...notFound, ...member }).success).toBe(false);
  });

  it('refuses a camelCase member', () => {
    expect(problemSchema.safeParse({ ...notFound, requestId: notFound.request_id }).success).toBe(
      false,
    );
  });
});
