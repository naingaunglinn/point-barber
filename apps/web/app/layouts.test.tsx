import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'point_locale' && cookie.value !== undefined ? { value: cookie.value } : undefined,
  }),
}));

const { RootLayout } = await import('./root-layout');
const { default: StaffLayout } = await import('./staff/layout');
const { default: SiteLayout } = await import('./site/layout');

type HtmlProps = { lang: string; 'data-tree': string };

beforeEach(() => {
  cookie.value = undefined;
  // The layouts read the error-reporting values through env.ts (add-staging-deploy design D10).
  vi.stubEnv('SITE_ORIGIN', 'https://point.test');
  vi.stubEnv('APP_ORIGIN', 'https://app.point.test');
  vi.stubEnv('NEXT_PUBLIC_API_BASE', '/api/v1');
  vi.stubEnv('API_INTERNAL_BASE', 'http://api:3001/api/v1');
  vi.stubEnv('APP_ENV', 'test');
});

// ui-foundation "The language is the account's, else the system default; the cookie serves only
// before a session exists" — the tree sets `<html lang>` to the resolved language (D-PLT-03 ·
// AD-L10N-06 · AD-L10N-04). No session exists before add-foundation-auth-access.
describe('the root layouts set <html lang>', () => {
  it('Scenario: First visit without a cookie and without a session — lang="my"', async () => {
    const layout = (await StaffLayout({ children: null })) as ReactElement<{ locale: string }>;
    expect(layout.props.locale).toBe('my');
  });

  it.each(['my', 'en'])('the staff tree takes the cookie point_locale=%s', async (value) => {
    cookie.value = value;
    const layout = (await StaffLayout({ children: null })) as ReactElement<{ locale: string }>;
    expect(layout.props.locale).toBe(value);
  });

  it('the staff tree ignores a cookie that is not my or en', async () => {
    cookie.value = 'fr';
    const layout = (await StaffLayout({ children: null })) as ReactElement<{ locale: string }>;
    expect(layout.props.locale).toBe('my');
  });

  it('the site tree stays on the default language until the website change adds [locale]', () => {
    cookie.value = 'en';
    const layout = SiteLayout({ children: null }) as ReactElement<{ locale: string }>;
    expect(layout.props.locale).toBe('my');
  });

  it('RootLayout writes the language and the tree on <html>', () => {
    const html = RootLayout({
      tree: 'staff',
      locale: 'en',
      children: null,
    }) as ReactElement<HtmlProps>;
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('en');
    expect(html.props['data-tree']).toBe('staff');
  });
});

// add-staging-deploy task 4.1 — error reporting is mounted only when SENTRY_DSN_WEB is set, with the
// values of the running environment, inside its own Suspense boundary so the layouts stay static
// (design D10 · ADR-006). env.ts reads once, so a second value needs fresh modules.
describe('the root layouts mount error reporting in a Suspense boundary', () => {
  type Body = ReactElement<{ children: [unknown, ReactElement] }>;

  it('the site layout reads nothing of the request: a plain function, no connection()', () => {
    const layout = SiteLayout({ children: null }) as ReactElement<{ locale: string }>;
    expect(layout).not.toBeInstanceOf(Promise);
    expect(layout.props.locale).toBe('my');
  });

  it('RootLayout puts <RuntimeReporting> after the page, in both trees', () => {
    for (const tree of ['staff', 'site'] as const) {
      const html = RootLayout({ tree, locale: 'my', children: null }) as ReactElement<{
        children: [unknown, Body];
      }>;
      expect((html.props.children[1].props.children[1].type as { name: string }).name).toBe(
        'RuntimeReporting',
      );
    }
  });

  it('renders nothing without SENTRY_DSN_WEB', async () => {
    const { RuntimeReportingValues } = await import('../lib/observability/runtime-reporting');
    expect(await RuntimeReportingValues()).toBeNull();
  });

  it('passes the DSN, environment and release of the running environment when it is set', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN_WEB', 'https://public@o0.ingest.sentry.io/2');
    vi.stubEnv('APP_VERSION', 'v0.1.0');
    const { RuntimeReportingValues } = await import('../lib/observability/runtime-reporting');
    const element = (await RuntimeReportingValues()) as ReactElement<Record<string, string>>;
    expect(element.props).toStrictEqual({
      dsn: 'https://public@o0.ingest.sentry.io/2',
      environment: 'test',
      release: 'v0.1.0',
    });
  });
});
