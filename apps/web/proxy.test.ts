import { NextRequest } from 'next/server';
import { getRewrittenUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { config, proxy } from './proxy';

beforeAll(() => {
  vi.stubEnv('SITE_ORIGIN', 'https://point.test');
  vi.stubEnv('APP_ORIGIN', 'https://app.point.test');
  vi.stubEnv('NEXT_PUBLIC_API_BASE', '/api/v1');
  vi.stubEnv('API_INTERNAL_BASE', 'http://api:3001/api/v1');
});

function requestTo(host: string, path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { host } });
}

// Technical guarantee of task 5.3 (design D11): proxy.ts applies resolveRoute without losing the
// query string, and its matcher skips only Next.js's own assets and the self-hosted fonts.
describe('apps/web/proxy.ts (ADR-001 host rewrite · design D11)', () => {
  it('keeps the query string when it rewrites into a tree', () => {
    const response = proxy(requestTo('point.test', '/book?branch=B3&book=1'));
    expect(getRewrittenUrl(response)).toBe('http://localhost:3000/site/book?branch=B3&book=1');
  });

  it("rewrites a refused path to the app's not-found page", () => {
    const response = proxy(requestTo('point.test', '/staff'));
    expect(getRewrittenUrl(response)).toBe('http://localhost:3000/_not-routed');
  });

  it('lets /internal/revalidate through without a rewrite', () => {
    const response = proxy(requestTo('web:3000', '/internal/revalidate'));
    expect(getRewrittenUrl(response)).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/', '/book', '/site', '/staff/today', '/staff/report.pdf', '/internal/revalidate'])(
    'runs for %s',
    (path) => {
      expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(true);
    },
  );

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/fonts/pyidaungsu-regular.woff2',
    '/vendor/zxing-wasm@3.1.3/zxing_reader.wasm',
  ])('skips %s', (path) => {
    expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(false);
  });

  it.each(['/staff/fonts/x.woff2', '/fontsx', '/staff/vendor/x.wasm', '/vendorx'])(
    'still runs for %s',
    (path) => {
      expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(true);
    },
  );
});
