import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
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
