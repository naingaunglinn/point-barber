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

  it('the site tree stays on the default language until the website change adds [locale]', async () => {
    cookie.value = 'en';
    const layout = (await SiteLayout({ children: null })) as ReactElement<{ locale: string }>;
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

// add-staging-deploy task 4.1 — <ErrorReporting> is mounted only when SENTRY_DSN_WEB is set; the
// values are read by env.ts when the server starts (design D10). env.ts reads once, so a second
// value needs fresh modules.
describe('the root layouts mount error reporting only with a DSN', () => {
  type Reporting = { reporting?: { dsn: string; environment: string; release: string } };
  type Body = ReactElement<{ children: [unknown, ReactElement | null] }>;

  it('passes no reporting values without SENTRY_DSN_WEB, and RootLayout renders none', async () => {
    const staff = (await StaffLayout({ children: null })) as ReactElement<Reporting>;
    const site = (await SiteLayout({ children: null })) as ReactElement<Reporting>;
    expect(staff.props.reporting).toBeUndefined();
    expect(site.props.reporting).toBeUndefined();
    const html = RootLayout({ tree: 'staff', locale: 'my', children: null }) as ReactElement<{
      children: [unknown, Body];
    }>;
    expect(html.props.children[1].props.children[1]).toBeNull();
  });

  it('passes the DSN, environment and release to both trees when SENTRY_DSN_WEB is set', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN_WEB', 'https://public@o0.ingest.sentry.io/2');
    vi.stubEnv('APP_VERSION', 'v0.1.0');
    const fresh = {
      staff: (await import('./staff/layout')).default,
      site: (await import('./site/layout')).default,
    };
    const expected = {
      dsn: 'https://public@o0.ingest.sentry.io/2',
      environment: 'test',
      release: 'v0.1.0',
    };
    const staff = (await fresh.staff({ children: null })) as ReactElement<Reporting>;
    const site = (await fresh.site({ children: null })) as ReactElement<Reporting>;
    expect(staff.props.reporting).toStrictEqual(expected);
    expect(site.props.reporting).toStrictEqual(expected);
    const html = RootLayout({
      tree: 'staff',
      locale: 'my',
      reporting: expected,
      children: null,
    }) as ReactElement<{ children: [unknown, Body] }>;
    expect(html.props.children[1].props.children[1]?.props).toStrictEqual(expected);
  });
});
