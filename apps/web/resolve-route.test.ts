import { describe, expect, it } from 'vitest';

import { resolveRoute, type RouteHosts } from './resolve-route';

// The hosts of the local stack: SITE_ORIGIN=https://point.test, APP_ORIGIN=https://app.point.test.
const hosts: RouteHosts = { site: 'point.test', staff: 'app.point.test' };

// The routing half of each scenario; the browser half (status, placeholder element) is smoke.spec.ts
// (design D18).
describe('add-repo-scaffold · platform-runtime · The Host header selects the route tree', () => {
  it('Scenario: Public host shows the site tree', () => {
    expect(resolveRoute('point.test', '/', hosts)).toEqual({ kind: 'rewrite', pathname: '/site' });
  });

  it('Scenario: Staff host shows the staff tree', () => {
    expect(resolveRoute('app.point.test', '/', hosts)).toEqual({
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
    expect(resolveRoute('App.Point.Test', '/', hosts)).toEqual({
      kind: 'rewrite',
      pathname: '/staff',
    });
  });
});
