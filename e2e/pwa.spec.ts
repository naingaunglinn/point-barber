import { z } from 'zod';

import { expect, test } from './fixtures.js';
import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';
import { readJson } from './helpers/json.js';
import { MOBILE } from './helpers/walkin.js';

// add-pwa-install task 6.1, first part — the manifest and the page head on the stack (spec requirements 1, 2 and
// 3 · AD-PWA-01 · ADR-009). Neither needs a sign-in. Elements are found by selector on the head and by test id
// elsewhere (CG-TEST-06). The guide, the entries and the first-login tip follow in the next part.

/** The colour of `--background` as hex — the neutral white of tokens.css (PW2). */
const BACKGROUND = '#ffffff';

const manifestSchema = z.object({
  id: z.string(),
  start_url: z.string(),
  scope: z.string(),
  display: z.string(),
  name: z.string(),
  short_name: z.string(),
  theme_color: z.string(),
  background_color: z.string(),
  icons: z.array(z.object({ src: z.string(), sizes: z.string(), purpose: z.string() })),
});

test.describe('add-pwa-install · ui-foundation · the manifest (requirements 1 and 3)', () => {
  test('Scenario: The manifest without a session — and the icons', async ({ app }) => {
    const response = await app.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await readJson(manifestSchema, response);
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      name: 'Point Barbershop',
      short_name: 'Point',
      theme_color: BACKGROUND,
      background_color: BACKGROUND,
    });
    expect(manifest.icons.map((icon) => [icon.src, icon.sizes, icon.purpose])).toEqual([
      ['/icons/icon-192.png', '192x192', 'any'],
      ['/icons/icon-512.png', '512x512', 'any'],
      ['/icons/icon-maskable-512.png', '512x512', 'maskable'],
    ]);
    for (const { src } of manifest.icons) {
      const icon = await app.get(src);
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()['content-type']).toBe('image/png');
    }
    expect((await app.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  });

  test('Scenario: The public site has no manifest', async ({ site, page }) => {
    expect((await site.get('/manifest.webmanifest')).status()).toBe(404);
    await page.goto(`${SITE_ORIGIN}/`);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(0);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
  });
});

test.describe('add-pwa-install · ui-foundation · the head of a staff page (requirement 2)', () => {
  test('Scenario: The head of the login screen, without a session, each tag exactly once', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: APP_ORIGIN,
      ignoreHTTPSErrors: true,
      viewport: MOBILE,
    });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icons/apple-touch-icon.png',
    );
    const content = async (name: string) => {
      const tags = page.locator(`meta[name="${name}"]`);
      await expect(tags, name).toHaveCount(1);
      return tags.getAttribute('content');
    };
    expect(await content('theme-color')).toBe(BACKGROUND);
    expect(await content('apple-mobile-web-app-capable')).toBe('yes');
    expect(await content('mobile-web-app-capable')).toBe('yes');
    expect(await content('apple-mobile-web-app-status-bar-style')).toBe('default');
    expect(await content('apple-mobile-web-app-title')).toBe('Point');
    expect(await content('viewport')).toContain('viewport-fit=cover');
    await context.close();
  });
});
