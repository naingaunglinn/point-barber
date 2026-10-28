import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// add-staging-deploy task 4.2 — server-render errors (design D10 · CG-OBS-04): without a DSN the
// module loads nothing and reports nothing; with one, every request error is reported.

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
}));
vi.mock('@sentry/nextjs', () => sdk);

const request = { path: '/?branch=B3', method: 'GET', headers: {} };
const context = {
  routerKind: 'App Router',
  routePath: '/staff',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
} as const;

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockClear();
  sdk.captureRequestError.mockClear();
  vi.stubEnv('SITE_ORIGIN', 'https://point.test');
  vi.stubEnv('APP_ORIGIN', 'https://app.point.test');
  vi.stubEnv('NEXT_PUBLIC_API_BASE', '/api/v1');
  vi.stubEnv('API_INTERNAL_BASE', 'http://api:3001/api/v1');
  vi.stubEnv('APP_ENV', 'staging');
  vi.stubEnv('APP_VERSION', 'v0.1.0');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('instrumentation.ts (task 4.2)', () => {
  it('does nothing without SENTRY_DSN_WEB', async () => {
    vi.stubEnv('SENTRY_DSN_WEB', '');
    const { register, onRequestError } = await import('./instrumentation');
    register();
    await onRequestError(new Error('render failed'), request, context);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
  });

  it('with a DSN starts the server SDK with the run-time values and reports a request error', async () => {
    vi.stubEnv('SENTRY_DSN_WEB', 'https://public@o0.ingest.sentry.io/2');
    const { register, onRequestError } = await import('./instrumentation');
    register();
    const error = new Error('render failed');
    await onRequestError(error, request, context);
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://public@o0.ingest.sentry.io/2',
      environment: 'staging',
      release: 'v0.1.0',
      defaultIntegrations: false,
      maxBreadcrumbs: 0,
    });
    expect(sdk.captureRequestError).toHaveBeenCalledWith(error, request, context);
  });

  it('does not stop the server when the environment is incomplete', async () => {
    vi.stubEnv('APP_ENV', '');
    const { register } = await import('./instrumentation');
    expect(() => register()).not.toThrow();
    expect(sdk.init).not.toHaveBeenCalled();
  });
});
