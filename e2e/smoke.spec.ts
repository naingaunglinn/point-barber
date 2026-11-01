import { expect, test } from './fixtures.js';
import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';

// The built stack answers on both hosts and each host shows its own route tree (task 8.2 · design
// D11 · D18). Pages are opened with full URLs; `site` and `app` are the request contexts of the two
// hosts (fixtures.ts).

const SITE_PLACEHOLDER = '[data-testid="site-placeholder"]';
const LOGIN_EMAIL = '[data-testid="login-email"]';
const LOGIN_GOOGLE = '[data-testid="login-google"]';
const TODAY = '[data-testid="today"]';

test.describe('smoke: health through both hosts (P1.SYS.01)', () => {
  test('health is ok on the public host and on the staff host', async ({ site, app }) => {
    for (const [host, context] of [
      ['public', site],
      ['staff', app],
    ] as const) {
      const res = await context.get('/api/v1/health');
      expect(res.status(), host).toBe(200);
      expect(await res.json(), host).toMatchObject({ status: 'ok' });
    }
  });
});

// The two scenarios as add-foundation-auth-access modifies them (task 7.2 · design D17): the staff
// host sends a browser without a session to the login screen.
test.describe('add-foundation-auth-access · platform-runtime · The Host header selects the route tree', () => {
  test('Scenario: Public host shows the site tree', async ({ page }) => {
    const res = await page.goto(`${SITE_ORIGIN}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator(SITE_PLACEHOLDER)).toHaveCount(1);
    await expect(page.locator(LOGIN_EMAIL)).toHaveCount(0);
    await expect(page.locator(TODAY)).toHaveCount(0);
  });

  test('Scenario: Staff host shows the staff tree — the login screen without a session', async ({
    app,
    page,
  }) => {
    const res = await app.get('/', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe(`${APP_ORIGIN}/login?return_to=%2F`);
    await page.goto(`${APP_ORIGIN}/`);
    await expect(page.locator(LOGIN_EMAIL)).toHaveCount(1);
    await expect(page.locator(LOGIN_GOOGLE)).toHaveCount(1);
    await expect(page.locator(SITE_PLACEHOLDER)).toHaveCount(0);
  });

  test('Scenario: The path and query asked for are kept', async ({ app }) => {
    const res = await app.get('/?branch=B3', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe(`${APP_ORIGIN}/login?return_to=%2F%3Fbranch%3DB3`);
  });

  test('Scenario: The login screen needs no session', async ({ page }) => {
    const res = await page.goto(`${APP_ORIGIN}/login`);
    expect(res?.status()).toBe(200);
    await expect(page.locator(LOGIN_EMAIL)).toHaveCount(1);
  });

  test('Scenario: The login screen is not on the public host', async ({ page }) => {
    const res = await page.goto(`${SITE_ORIGIN}/login`);
    expect(res?.status()).toBe(404);
    await expect(page.locator(LOGIN_EMAIL)).toHaveCount(0);
  });
});
