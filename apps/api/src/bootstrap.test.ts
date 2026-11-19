import { readFileSync } from 'node:fs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it } from 'vitest';

import { configureApp } from './bootstrap.js';
import { Clock, SystemClock } from './common/clock/clock.js';
import { AppConfig } from './common/config/config.js';
import { ProblemFilter } from './common/http/problem.filter.js';
import { LOGGER, createLogger } from './common/logging/logger.js';

// Task 4.1 — the bootstrap registers no CORS, no URL-encoded parser and no versioning
// (API-SHAPE-01 · API-SHAPE-05 · ADR-009 action items 2 and 4 · design D5).

interface Recorded {
  readonly calls: string[];
  readonly middleware: string[];
  readonly settings: Map<string, unknown>;
  readonly disabled: string[];
  prefix?: string;
}

function fakeApp(): { app: NestExpressApplication; recorded: Recorded } {
  const recorded: Recorded = { calls: [], middleware: [], settings: new Map(), disabled: [] };
  const providers = new Map<unknown, unknown>([
    [LOGGER, createLogger('silent')],
    [Clock, new SystemClock()],
    [ProblemFilter, {}],
    [AppConfig, { env: { TRUSTED_PROXY_HOPS: 1 } }],
  ]);
  const app = new Proxy(
    {},
    {
      get(_target, name: string) {
        return (...args: unknown[]) => {
          recorded.calls.push(name);
          if (name === 'get') return providers.get(args[0]);
          if (name === 'use')
            recorded.middleware.push(...args.map((fn) => (fn as { name: string }).name));
          if (name === 'set') recorded.settings.set(args[0] as string, args[1]);
          if (name === 'disable') recorded.disabled.push(args[0] as string);
          if (name === 'setGlobalPrefix') recorded.prefix = args[0] as string;
          return undefined;
        };
      },
    },
  ) as NestExpressApplication;
  return { app, recorded };
}

describe('configureApp', () => {
  const { app, recorded } = fakeApp();
  configureApp(app);

  it('registers no CORS and no versioning', () => {
    expect(recorded.calls).not.toContain('enableCors');
    expect(recorded.calls).not.toContain('enableVersioning');
  });

  it('registers the JSON parser and no URL-encoded parser', () => {
    expect(recorded.middleware).toContain('jsonParser');
    expect(recorded.middleware.some((name) => /urlencoded|cors/i.test(name))).toBe(false);
    expect(recorded.calls).not.toContain('useBodyParser');
  });

  it('serves under /api with one trusted proxy hop and no x-powered-by', () => {
    expect(recorded.prefix).toBe('api');
    expect(recorded.settings.get('trust proxy')).toBe(1);
    expect(recorded.disabled).toContain('x-powered-by');
  });
});

describe('main.ts', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

  it("turns Nest's default body parsers off (they would add a URL-encoded parser)", () => {
    expect(source).toMatch(/bodyParser:\s*false/);
  });

  it('enables no CORS and no versioning', () => {
    expect(source).not.toMatch(/enableCors|enableVersioning|VersioningType|urlencoded/);
  });
});
