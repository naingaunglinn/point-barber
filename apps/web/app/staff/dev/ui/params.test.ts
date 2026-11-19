import { describe, expect, it } from 'vitest';

import { catalogueHref, DEFAULT_NOW, parseCatalogueParams } from './params';

// add-shared-ui-components task 4.1 · design D12 · ui-foundation conventions: the query parameters
// `lang=my|en`, `theme=staff|site` (default staff), `as=admin|manager|barber|branch-holder` and
// `now=<ISO instant>` (default 2026-10-05T10:42:00+06:30); the parameters win over the cookie for
// this page only.
describe('parseCatalogueParams', () => {
  it('defaults: language from the cookie, else my; staff; admin; Monday 05/Oct/2026 10:42 MMT', () => {
    expect(parseCatalogueParams({})).toEqual({
      lang: 'my',
      theme: 'staff',
      as: 'admin',
      now: DEFAULT_NOW,
    });
    expect(DEFAULT_NOW).toBe('2026-10-05T10:42:00+06:30');
    expect(parseCatalogueParams({}, 'en').lang).toBe('en');
  });

  it('the lang parameter wins over the cookie', () => {
    expect(parseCatalogueParams({ lang: 'en' }, 'my').lang).toBe('en');
    expect(parseCatalogueParams({ lang: 'my' }, 'en').lang).toBe('my');
  });

  it('takes every valid value', () => {
    expect(
      parseCatalogueParams({
        lang: 'en',
        theme: 'site',
        as: 'branch-holder',
        now: '2026-10-05T17:29:30Z',
      }),
    ).toEqual({ lang: 'en', theme: 'site', as: 'branch-holder', now: '2026-10-05T17:29:30Z' });
    for (const as of ['admin', 'manager', 'barber', 'branch-holder']) {
      expect(parseCatalogueParams({ as }).as).toBe(as);
    }
  });

  it('ignores an unknown value and keeps the default', () => {
    expect(
      parseCatalogueParams({ lang: 'fr', theme: 'dark', as: 'owner', now: 'yesterday' }, 'en'),
    ).toEqual({ lang: 'en', theme: 'staff', as: 'admin', now: DEFAULT_NOW });
    expect(parseCatalogueParams({ now: '2026-10-05T10:42:00' }).now).toBe(DEFAULT_NOW);
    expect(parseCatalogueParams({ now: '2026-02-31T10:42:00Z' }).now).toBe(DEFAULT_NOW);
    expect(parseCatalogueParams({ now: '2026-10-05T25:00:00Z' }).now).toBe(DEFAULT_NOW);
  });

  it('keeps an instant whose UTC date differs from its written date', () => {
    expect(parseCatalogueParams({ now: '2026-10-05T01:00:00+06:30' }).now).toBe(
      '2026-10-05T01:00:00+06:30',
    );
  });

  it('reads the first value of a repeated parameter', () => {
    expect(parseCatalogueParams({ lang: ['en', 'my'], theme: ['site'] })).toMatchObject({
      lang: 'en',
      theme: 'site',
    });
  });
});

describe('catalogueHref', () => {
  const params = parseCatalogueParams({ lang: 'en', theme: 'site', as: 'barber' });

  it('changes one parameter and keeps the others, as a plain link', () => {
    expect(catalogueHref(params, { lang: 'my' })).toBe(
      '/dev/ui?lang=my&theme=site&as=barber&now=2026-10-05T10%3A42%3A00%2B06%3A30',
    );
    expect(catalogueHref(params, { theme: 'staff' })).toContain('theme=staff');
  });

  it('round-trips through parseCatalogueParams', () => {
    const href = catalogueHref(params, { now: '2026-10-05T17:29:30Z' });
    const search = Object.fromEntries(new URL(href, 'https://app.point.test').searchParams);
    expect(parseCatalogueParams(search)).toEqual({ ...params, now: '2026-10-05T17:29:30Z' });
  });
});
