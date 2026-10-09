import { expect, test } from './fixtures.js';
import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';

// The built stack answers on both hosts and each host shows its own route tree (task 8.2 · design
// D11 · D18). Pages are opened with full URLs; `site` and `app` are the request contexts of the two
// hosts (fixtures.ts).

const SITE_PLACEHOLDER = '[data-testid="site-placeholder"]';
const STAFF_PLACEHOLDER = '[data-testid="staff-placeholder"]';

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

test.describe('add-repo-scaffold · platform-runtime · The Host header selects the route tree', () => {
  test('Scenario: Public host shows the site tree', async ({ page }) => {
    const res = await page.goto(`${SITE_ORIGIN}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator(SITE_PLACEHOLDER)).toHaveCount(1);
    await expect(page.locator(STAFF_PLACEHOLDER)).toHaveCount(0);
  });

  test('Scenario: Staff host shows the staff tree', async ({ page }) => {
    const res = await page.goto(`${APP_ORIGIN}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator(STAFF_PLACEHOLDER)).toHaveCount(1);
    await expect(page.locator(SITE_PLACEHOLDER)).toHaveCount(0);
  });
});
