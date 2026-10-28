import { describe, expect, it, vi } from 'vitest';

import { ErrorReporter, isReported } from './error-reporter.js';

// add-staging-deploy task 3.4 — the capture filter (design D9 · CG-OBS-04): spec "Expected problem
// answers are not sent to Sentry".

describe('isReported (task 3.4)', () => {
  it.each([500, 502, 503])('reports a %i answer', (status) => {
    expect(isReported(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('never reports a %i answer', (status) => {
    expect(isReported(status)).toBe(false);
  });
});

describe('ErrorReporter', () => {
  it('without a sink reports nowhere and closes at once', async () => {
    const reporter = new ErrorReporter();
    expect(() => reporter.capture(new Error('x'), {})).not.toThrow();
    await expect(reporter.close()).resolves.toBeUndefined();
  });

  it('hands each report to the sink, and stops after close', async () => {
    const sink = { capture: vi.fn(), close: vi.fn(() => Promise.resolve(true)) };
    const reporter = new ErrorReporter();
    reporter.use(sink);
    const error = new Error('x');
    reporter.capture(error, { job: 'email.send' });
    await reporter.close(500);
    reporter.capture(error, { job: 'email.send' });
    expect(sink.capture).toHaveBeenCalledOnce();
    expect(sink.capture).toHaveBeenCalledWith(error, { job: 'email.send' }, undefined);
    expect(sink.close).toHaveBeenCalledWith(500);
  });
});
