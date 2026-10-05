import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://point_app:pw@localhost:5432/point',
  SITE_ORIGIN: 'https://point.test',
  APP_ORIGIN: 'https://app.point.test',
  API_PORT: '3001',
  LOG_LEVEL: 'info',
  INTERNAL_SSR_KEY: 's'.repeat(16),
  INTERNAL_OPS_KEY: 'o'.repeat(16),
};

// API-SHAPE-02 · CG-SEC-05 · design D5 / D9 — the API reads its environment once, through this schema.
describe('API environment schema', () => {
  it('reads a complete environment', () => {
    expect(parseApiEnv(valid)).toMatchObject({ API_PORT: 3001, SITE_ORIGIN: 'https://point.test' });
  });

  it('stops the start when DATABASE_URL is missing, naming it', () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.DATABASE_URL;
    expect(() => parseApiEnv(rest)).toThrow(/DATABASE_URL is required/);
  });

  it('stops the start when INTERNAL_SSR_KEY equals INTERNAL_OPS_KEY', () => {
    expect(() => parseApiEnv({ ...valid, INTERNAL_OPS_KEY: valid.INTERNAL_SSR_KEY })).toThrow(
      /INTERNAL_SSR_KEY and INTERNAL_OPS_KEY must be different/,
    );
  });

  it('defaults APP_VERSION to 0.0.0-dev when it is not set', () => {
    expect(parseApiEnv(valid).APP_VERSION).toBe('0.0.0-dev');
    expect(parseApiEnv({ ...valid, APP_VERSION: '' }).APP_VERSION).toBe('0.0.0-dev');
    expect(parseApiEnv({ ...valid, APP_VERSION: '0.1.0' }).APP_VERSION).toBe('0.1.0');
  });

  it('names every failing variable in one error and never prints a value', () => {
    let message = '';
    try {
      parseApiEnv({ ...valid, SITE_ORIGIN: 'not a url', API_PORT: 'abc' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SITE_ORIGIN/);
    expect(message).toMatch(/API_PORT/);
    expect(message).not.toMatch(/ssr-key|ops-key|point_app:pw/);
  });
});
