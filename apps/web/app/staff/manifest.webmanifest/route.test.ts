import { describe, expect, it } from 'vitest';

import fixture from '../../../test/fixtures/pwa-colours.json';
import { GET } from './route';

// add-pwa-install task 1.4 · spec "The manifest without a session" — the handler's own answer; the proxy's
// handling of the path is in proxy.test.ts and resolve-route.test.ts, the two hosts over HTTP in e2e/pwa.spec.ts.
describe('GET /manifest.webmanifest', () => {
  it('answers 200 application/manifest+json, cacheable, with the manifest of the staff app', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/manifest+json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await response.json()).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      name: 'Point Barbershop',
      short_name: 'Point',
      theme_color: fixture.colours.white.hex,
      background_color: fixture.colours.white.hex,
    });
  });
});
