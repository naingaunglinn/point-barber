import { describe, expect, it } from 'vitest';

import { parseWebEnv, type RawWebEnv } from './env';

// Technical guarantee, no spec scenario (task 5.2): the web app reads its environment through one
// validated schema, and a missing variable stops it with the variable's name.
const complete: RawWebEnv = {
  SITE_ORIGIN: 'https://point.test',
  APP_ORIGIN: 'https://app.point.test',
  APP_VERSION: '0.1.0',
  NEXT_PUBLIC_API_BASE: '/api/v1',
  API_INTERNAL_BASE: 'http://api:3001/api/v1',
};

describe('apps/web/env.ts (CG-SEC-05 · ADR-009 action item 3 · design D11)', () => {
  it('reads a complete environment', () => {
    expect(parseWebEnv(complete)).toEqual(complete);
  });

  it('defaults APP_VERSION to 0.0.0-dev when it is not set or empty', () => {
    expect(parseWebEnv({ ...complete, APP_VERSION: undefined }).APP_VERSION).toBe('0.0.0-dev');
    expect(parseWebEnv({ ...complete, APP_VERSION: '' }).APP_VERSION).toBe('0.0.0-dev');
  });

  it.each(['SITE_ORIGIN', 'APP_ORIGIN', 'NEXT_PUBLIC_API_BASE', 'API_INTERNAL_BASE'] as const)(
    'fails with the name of the missing variable %s',
    (name) => {
      expect(() => parseWebEnv({ ...complete, [name]: undefined })).toThrow(`${name} is required`);
    },
  );

  it('names every failing variable in one error', () => {
    expect(() => parseWebEnv({ ...complete, SITE_ORIGIN: '', APP_ORIGIN: undefined })).toThrow(
      'Invalid web app environment: SITE_ORIGIN is required; APP_ORIGIN is required',
    );
  });

  it('fails on an origin with a path', () => {
    expect(() => parseWebEnv({ ...complete, SITE_ORIGIN: 'https://point.test/' })).toThrow(
      'SITE_ORIGIN must be an origin',
    );
  });

  it('fails on a browser API base that is not a same-origin path', () => {
    expect(() =>
      parseWebEnv({ ...complete, NEXT_PUBLIC_API_BASE: 'https://app.point.test/api/v1' }),
    ).toThrow('NEXT_PUBLIC_API_BASE must be a same-origin path');
  });
});
