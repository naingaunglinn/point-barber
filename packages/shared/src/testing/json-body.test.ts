import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { parseBody, readJsonBody } from './json-body.js';

// add-ci-lint-rules · "Test code reads a JSON body only through a schema" (CG-TS-02 · CG-TEST-03).
const errorBody = z.object({ code: z.string(), status: z.number().int() });

describe('parseBody', () => {
  it('Scenario: A valid body is returned typed', () => {
    const result = parseBody(errorBody, { code: 'validation', status: 400 });

    expect(result).toEqual({ code: 'validation', status: 400 });
    expectTypeOf(result.status).toEqualTypeOf<number>();
    // @ts-expect-error -- not in the schema
    expect(result.missing).toBeUndefined();
  });

  it('Scenario: A mismatched body names the path', () => {
    const mismatched = () => parseBody(errorBody, { code: 'validation', status: '400' });

    expect(mismatched).toThrow(/status/);
    expect(mismatched).toThrow('{"code":"validation","status":"400"}');
  });

  it('keeps only the first 200 characters of a long body', () => {
    const body = { code: 'x'.repeat(500), status: 'bad' };
    const text = JSON.stringify(body);

    expect(() => parseBody(errorBody, body)).toThrow(text.slice(0, 200));
    expect(() => parseBody(errorBody, body)).not.toThrow(text.slice(0, 201));
  });
});

describe('readJsonBody', () => {
  it('reads response.json() as unknown and parses it', async () => {
    const response = { json: () => Promise.resolve({ code: 'conflict', status: 409 }) };

    expect(await readJsonBody(errorBody, response)).toEqual({ code: 'conflict', status: 409 });
  });

  it('rejects a body that does not match', async () => {
    const response = { json: () => Promise.resolve({ code: 1 }) };

    await expect(readJsonBody(errorBody, response)).rejects.toThrow(/code/);
  });
});
