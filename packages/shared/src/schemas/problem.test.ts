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

  it('refuses a camelCase member', () => {
    expect(problemSchema.safeParse({ ...notFound, requestId: notFound.request_id }).success).toBe(
      false,
    );
  });
});
