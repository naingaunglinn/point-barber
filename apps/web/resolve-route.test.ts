import { describe, expect, it } from 'vitest';

import { resolveRoute, type RouteHosts } from './resolve-route';

// The hosts of the local stack: SITE_ORIGIN=https://point.test, APP_ORIGIN=https://app.point.test.
const hosts: RouteHosts = { site: 'point.test', staff: 'app.point.test' };

const signedIn = { hasSession: true } as const;

// The routing half of each scenario; the browser half (status, placeholder element) is smoke.spec.ts
// (design D18).
describe('add-repo-scaffold · platform-runtime · The Host header selects the route tree', () => {
  it('Scenario: Public host shows the site tree', () => {
    expect(resolveRoute('point.test', '/', hosts)).toEqual({ kind: 'rewrite', pathname: '/site' });
  });

  it('Scenario: Staff host shows the staff tree — signed in', () => {
    expect(resolveRoute('app.point.test', '/', hosts, signedIn)).toEqual({
      kind: 'rewrite',
      pathname: '/staff',
    });
  });

  it('Scenario: The staff tree cannot be opened through the public host', () => {
    expect(resolveRoute('point.test', '/staff', hosts)).toEqual({ kind: 'not-found' });
  });

  it('Scenario: The site tree cannot be opened through the staff host', () => {
    expect(resolveRoute('app.point.test', '/site', hosts)).toEqual({ kind: 'not-found' });
  });

  it("Scenario: A tree's own folder name is not a public path", () => {
    expect(resolveRoute('point.test', '/site', hosts)).toEqual({ kind: 'not-found' });
    expect(resolveRoute('app.point.test', '/staff/today', hosts)).toEqual({ kind: 'not-found' });
  });

  it('Scenario: An unknown host gets nothing', () => {
    expect(resolveRoute('evil.test', '/', hosts)).toEqual({ kind: 'not-found' });
  });
});

// The remaining cases of task 5.3 (design D11).
describe('resolveRoute (ADR-001 host rewrite · design D11)', () => {
  it('rewrites a path on the public host into the site tree: /book → /site/book', () => {
    expect(resolveRoute('point.test', '/book', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/site/book',
    });
  });

  it.each(['/site', '/staff', '/site/x', '/staff/today'])(
    'answers 404 for %s on both hosts',
    (path) => {
      expect(resolveRoute('point.test', path, hosts)).toEqual({ kind: 'not-found' });
      expect(resolveRoute('app.point.test', path, hosts)).toEqual({ kind: 'not-found' });
    },
  );

  it('answers 404 for an unknown host on any path', () => {
    expect(resolveRoute('evil.test', '/book', hosts)).toEqual({ kind: 'not-found' });
  });

  it('passes /internal/revalidate through unchanged on the in-network host web:3000', () => {
    expect(resolveRoute('web:3000', '/internal/revalidate', hosts)).toEqual({ kind: 'pass' });
  });

  it('matches a tree folder by whole segment: /staffing is an ordinary path', () => {
    expect(resolveRoute('point.test', '/staffing', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/site/staffing',
    });
  });

  it('compares the host case-insensitively', () => {
    expect(resolveRoute('App.Point.Test', '/', hosts, signedIn)).toEqual({
      kind: 'rewrite',
      pathname: '/staff',
    });
  });
});

// add-foundation-auth-access task 7.2 — the two platform-runtime requirements this change modifies:
// "The Host header selects the route tree" and "API is served under /api/v1 on the web app's own
// origin" (design D17).
describe('add-foundation-auth-access · platform-runtime · The Host header selects the route tree', () => {
  it('Scenario: Staff host shows the staff tree — 307 to the login screen without a cookie', () => {
    expect(resolveRoute('app.point.test', '/', hosts)).toEqual({
      kind: 'redirect',
      location: '/login?return_to=%2F',
    });
  });

  it('Scenario: The path and query asked for are kept', () => {
    expect(resolveRoute('app.point.test', '/', hosts, { search: '?branch=B3' })).toEqual({
      kind: 'redirect',
      location: '/login?return_to=%2F%3Fbranch%3DB3',
    });
  });

  it('Scenario: The login screen needs no session', () => {
    expect(resolveRoute('app.point.test', '/login', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/staff/login',
    });
  });

  it('the catalogue opens without a session', () => {
    expect(resolveRoute('app.point.test', '/dev/ui', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/staff/dev/ui',
    });
  });

  it('Scenario: The login screen is not on the public host — the site tree has no /login', () => {
    expect(resolveRoute('point.test', '/login', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/site/login',
    });
  });

  it('a look-alike of an open path is not open', () => {
    expect(resolveRoute('app.point.test', '/loginx', hosts)).toEqual({
      kind: 'redirect',
      location: '/login?return_to=%2Floginx',
    });
  });

  it('/site and /staff answer 404 before the redirect', () => {
    expect(resolveRoute('app.point.test', '/staff', hosts)).toEqual({ kind: 'not-found' });
    expect(resolveRoute('app.point.test', '/site/x', hosts)).toEqual({ kind: 'not-found' });
  });

  it('an unknown host answers 404, with or without a cookie', () => {
    expect(resolveRoute('evil.test', '/', hosts)).toEqual({ kind: 'not-found' });
    expect(resolveRoute('evil.test', '/', hosts, signedIn)).toEqual({ kind: 'not-found' });
  });

  it('the public host never redirects', () => {
    expect(resolveRoute('point.test', '/', hosts)).toEqual({ kind: 'rewrite', pathname: '/site' });
  });
});

describe("add-foundation-auth-access · platform-runtime · API is served under /api/v1 on the web app's own origin", () => {
  it('Scenario: A path without the /api prefix is not the API — signed out: the login redirect', () => {
    expect(resolveRoute('app.point.test', '/v1/health', hosts)).toEqual({
      kind: 'redirect',
      location: '/login?return_to=%2Fv1%2Fhealth',
    });
  });

  it('Scenario: A path without the /api prefix is not the API — signed in: the staff tree, which has no such page', () => {
    expect(resolveRoute('app.point.test', '/v1/health', hosts, signedIn)).toEqual({
      kind: 'rewrite',
      pathname: '/staff/v1/health',
    });
  });
});
