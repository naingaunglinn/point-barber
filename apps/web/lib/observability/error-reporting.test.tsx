// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// add-staging-deploy task 4.1 — the web app's error reporting (design D10 · CG-OBS-03 · CG-OBS-04):
// the values come from the running environment, <ErrorReporting> renders nothing and starts the
// browser SDK after the first paint, and `beforeSend` keeps no query string, cookie, header or form
// value.

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  globalHandlersIntegration: () => ({ name: 'GlobalHandlers' }),
  linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  httpContextIntegration: () => ({ name: 'HttpContext' }),
}));
vi.mock('@sentry/nextjs', () => sdk);

const { ErrorReporting } = await import('./error-reporting');
const { initOptions, reportingOf } = await import('./options');
const { reportCaught } = await import('./browser');

const OPTIONS = {
  dsn: 'https://public@o0.ingest.sentry.io/2',
  environment: 'staging',
  release: 'v0.1.0',
};

afterEach(() => {
  cleanup();
});

describe('reportingOf (task 4.1)', () => {
  it('is off without a DSN', () => {
    expect(
      reportingOf({ SENTRY_DSN_WEB: undefined, APP_ENV: 'staging', APP_VERSION: 'v0.1.0' }),
    ).toBeUndefined();
  });

  it('takes the DSN, the environment and the release of the running environment', () => {
    expect(
      reportingOf({ SENTRY_DSN_WEB: OPTIONS.dsn, APP_ENV: 'staging', APP_VERSION: 'v0.1.0' }),
    ).toStrictEqual(OPTIONS);
  });
});

describe('the web beforeSend (task 4.1)', () => {
  const { beforeSend } = initOptions(OPTIONS);

  it('keeps the URL without its query string and drops cookies, headers and form values', () => {
    const event = beforeSend({
      message: 'failed for aung@point.test',
      request: {
        url: 'https://app.point.test/?branch=B3&code=48213907',
        method: 'POST',
        cookies: { point_session: 't' },
        headers: { Cookie: 'point_session=t', Referer: 'https://app.point.test/?code=1' },
        data: { email: 'aung@point.test' },
      },
    });
    expect(event.request).toStrictEqual({ url: 'https://app.point.test/', method: 'POST' });
    expect(event.message).toBe('failed for [redacted]');
  });

  it('sends no breadcrumb and starts no integration of its own', () => {
    expect(initOptions(OPTIONS)).toMatchObject({
      ...OPTIONS,
      defaultIntegrations: false,
      maxBreadcrumbs: 0,
    });
  });
});

describe('<ErrorReporting> (task 4.1)', () => {
  it('renders nothing and starts the browser SDK once with the values it was given', async () => {
    const { container, rerender } = render(<ErrorReporting {...OPTIONS} />);
    expect(container.innerHTML).toBe('');
    await waitFor(() => expect(sdk.init).toHaveBeenCalledOnce());
    rerender(<ErrorReporting {...OPTIONS} />);
    expect(sdk.init).toHaveBeenCalledOnce();
    const [options] = sdk.init.mock.calls[0] as [Record<string, unknown>];
    expect(options).toMatchObject({ ...OPTIONS, defaultIntegrations: false, maxBreadcrumbs: 0 });
    expect((options.integrations as { name: string }[]).map((i) => i.name)).toStrictEqual([
      'GlobalHandlers',
      'LinkedErrors',
      'Dedupe',
      'HttpContext',
    ]);
  });

  it('reports an error caught by global-error once the SDK has started', async () => {
    const error = new Error('render failed');
    reportCaught(error);
    await waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(error));
  });
});
