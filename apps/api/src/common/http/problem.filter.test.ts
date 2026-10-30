import type { ArgumentsHost } from '@nestjs/common';
import { ErrorCode, problemSchema } from '@point/shared';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config/config.js';
import { ErrorReporter } from '../observability/error-reporter.js';
import { ProblemException } from './problem.exception.js';
import { ProblemFilter } from './problem.filter.js';
import { RequestContext } from './request-context.js';

// The problem body with top-level extension members (API-ERR-01 · API-ERR-02 · P1-RULE-03 ·
// P1-RULE-04 · API-LIM-02 · design D4 · D5) — add-foundation-auth-access task 1.1.
const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const config = {
  env: { SITE_ORIGIN: 'https://point.test', APP_ORIGIN: 'https://app.point.test' },
} as unknown as AppConfig;
const log = { error: () => undefined } as unknown as Logger;

interface Sent {
  status?: number;
  type?: string;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
}

function send(error: unknown, reporter = new ErrorReporter()): Sent {
  const sent: Sent = { headers: {} };
  const res = {
    getHeader: () => undefined,
    setHeader(name: string, value: string) {
      sent.headers[name] = value;
      return res;
    },
    status(code: number) {
      sent.status = code;
      return res;
    },
    type(type: string) {
      sent.type = type;
      return res;
    },
    send(text: string) {
      sent.body = JSON.parse(text) as Record<string, unknown>;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/_fixtures/boom?code=1' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  RequestContext.run({ request_id: REQUEST_ID }, () => {
    new ProblemFilter(config, reporter, log).catch(error, host);
  });
  return sent;
}

const base = (code: string, title: string, status: number) => ({
  type: `https://point.test/errors/${code}`,
  title,
  status,
  code,
  request_id: REQUEST_ID,
});

describe('ProblemFilter · extension members', () => {
  it('puts `until` of login_locked at the top level', () => {
    const sent = send(
      new ProblemException(ErrorCode.LOGIN_LOCKED, 401, {
        extensions: { until: '2026-10-01T15:25:00+06:30' },
      }),
    );
    expect(sent.status).toBe(401);
    expect(sent.body).toStrictEqual({
      ...base('login_locked', 'Login locked', 401),
      until: '2026-10-01T15:25:00+06:30',
    });
    expect(problemSchema.parse(sent.body)).toStrictEqual(sent.body);
  });

  it('puts `reason` of session_revoked at the top level', () => {
    const sent = send(
      new ProblemException(ErrorCode.SESSION_REVOKED, 401, { extensions: { reason: 4 } }),
    );
    expect(sent.body).toStrictEqual({
      ...base('session_revoked', 'Session revoked', 401),
      reason: 4,
    });
    expect(problemSchema.parse(sent.body)).toStrictEqual(sent.body);
  });

  it('puts `retry_after` of rate_limited at the top level and sends the Retry-After header', () => {
    const sent = send(
      new ProblemException(ErrorCode.RATE_LIMITED, 429, {
        extensions: { retry_after: 900 },
        headers: { 'Retry-After': '900' },
      }),
    );
    expect(sent.status).toBe(429);
    expect(sent.type).toBe('application/problem+json');
    expect(sent.headers).toStrictEqual({ 'Retry-After': '900' });
    expect(sent.body).toStrictEqual({
      ...base('rate_limited', 'Rate limited', 429),
      retry_after: 900,
    });
    expect(problemSchema.parse(sent.body)).toStrictEqual(sent.body);
  });

  it('adds no member and no header when the problem has none', () => {
    const sent = send(new ProblemException(ErrorCode.OTP_INVALID, 401));
    expect(sent.body).toStrictEqual(base('otp_invalid', 'Otp invalid', 401));
    expect(sent.headers).toStrictEqual({});
  });

  it('keeps the extension members next to detail, errors and context', () => {
    const sent = send(
      new ProblemException(ErrorCode.RATE_LIMITED, 429, {
        detail: 'Too many code requests',
        context: { bucket: 'otp:ip' },
        extensions: { retry_after: 1 },
      }),
    );
    expect(sent.body).toStrictEqual({
      ...base('rate_limited', 'Rate limited', 429),
      detail: 'Too many code requests',
      context: { bucket: 'otp:ip' },
      retry_after: 1,
    });
  });

  it('sends no extension member and no header on an unexpected failure', () => {
    const sent = send(new Error('boom'));
    expect(sent.body).toStrictEqual(base('internal_error', 'Internal error', 500));
    expect(sent.headers).toStrictEqual({});
  });
});

// add-staging-deploy task 3.4 — the capture filter (design D9 · CG-OBS-04): only a defect is reported.
describe('ProblemFilter · error reporting', () => {
  const reporting = (error: unknown) => {
    const capture = vi.fn();
    const reporter = new ErrorReporter();
    reporter.use({ capture, close: () => Promise.resolve(true) });
    send(error, reporter);
    return capture;
  };

  it('reports an unexpected failure (500) with the request id, the URL and the method', () => {
    const error = new Error('boom');
    const capture = reporting(error);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      error,
      { request_id: REQUEST_ID },
      { url: 'https://app.point.test/api/v1/_fixtures/boom?code=1', method: 'POST' },
    );
  });

  it.each([
    [ErrorCode.VALIDATION, 400],
    [ErrorCode.UNAUTHENTICATED, 401],
    [ErrorCode.NOT_FOUND, 404],
    [ErrorCode.RATE_LIMITED, 429],
  ] as const)('never reports %s (%i)', (code, status) => {
    expect(reporting(new ProblemException(code, status))).not.toHaveBeenCalled();
  });
});
