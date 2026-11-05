import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { restartApi, sql } from './helpers/stack.js';
import {
  DESKTOP,
  MOBILE,
  type Session,
  apiAs,
  pageAs,
  sessionOf,
  setLanguage,
  walkinViolations,
} from './helpers/walkin.js';

// add-branch-management group 5 — Settings › Branches end to end on the stack (AD-NAV-02 · AD-LIST-01 ·
// AD-PERM-02 · AD-STATE-04 · P1.BR.02 · P1.BR.04 · P1.BR.05 · P1-RULE-09 · CG-TEST-06). Elements by test
// id or role, never by text; the one text checked is the in-use sentence of task 5.3, in English.
// Code requests in this file: 3 (U Kyaw Zin, Ma Hnin, Ko Aung), verifies: 3 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

const EMAIL = {
  kyawZin: 'kyawzin@point.test',
  hnin: 'hnin@point.test',
  aung: 'aung@point.test',
} as const;

/** B3 of the fixture (spec-fixtures §1 — packages/shared/src/testing/fixture-ids.ts). */
const B3 = '0199a3f2-0000-7000-8001-0000000000b3';
/** The phone 5.1 gives the new branch. */
const B4_PHONE = '09 7700 0004';

let admin: Session;
let hnin: Session;
let aung: Session;
let adminApi: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  // B4 is created by 5.1 and a branch is never deleted (D-DAT-05; its audit rows are append-only): a B4
  // an earlier run left on this database gets another code first, so 5.1 always creates B4.
  sql(
    `UPDATE branches SET code = 'X' || to_char(clock_timestamp(), 'DDHH24MISS') WHERE code = 'B4';`,
  );
  setLanguage(EMAIL.kyawZin, 'en');
  setLanguage(EMAIL.hnin, 'my');
  setLanguage(EMAIL.aung, 'en');
  admin = await sessionOf(playwright, EMAIL.kyawZin);
  hnin = await sessionOf(playwright, EMAIL.hnin);
  aung = await sessionOf(playwright, EMAIL.aung);
  adminApi = await apiAs(playwright, admin);
});
test.beforeEach(() => {
  walkinViolations.length = 0;
});
test.afterEach(() => {
  expect(walkinViolations, 'securitypolicyviolation events').toStrictEqual([]);
});
test.afterAll(async () => {
  await adminApi.dispose();
});

/** The input of a form field (its wrapper `branch-field-<member>`); `nth` picks the English one of a pair. */
const input = (page: Page, member: string, nth = 0): Locator =>
  page.getByTestId(`branch-field-${member}`).getByRole('textbox').nth(nth);

/** The kebab of the page header, which holds Deactivate (AD-LAY-04 — destructive behind the kebab). */
const headerMenu = (page: Page): Locator =>
  page.locator('[data-slot="page-actions"] [aria-haspopup="menu"]');

/**
 * The status badge of the detail header: the muted badge of an INACTIVE branch; an ACTIVE branch has none
 * (AD-CMP-05 master data).
 */
const badge = (page: Page): Locator =>
  page.getByTestId('branch-status-badge').locator('[data-slot="status-badge"]');

/** The status chips of the list's filter bar: ACTIVE, then INACTIVE. */
const chip = (page: Page, which: 'active' | 'inactive'): Locator =>
  page.locator('[data-slot="status-chips"] button').nth(which === 'active' ? 0 : 1);

async function deactivate(page: Page, reason?: string): Promise<Locator> {
  await headerMenu(page).click();
  await page.getByTestId('branch-deactivate').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  if (reason !== undefined) await dialog.getByRole('textbox').fill(reason);
  // The footer: Keep active, then the confirm button, last (AD-LAY-04).
  await dialog.getByRole('button').last().click();
  return dialog;
}

test.describe('add-branch-management · organization · Settings › Branches end to end', () => {
  test('5.1 — U Kyaw Zin creates B4, sets its phone, deactivates it, finds it under Inactive and re-activates it (1280 × 800)', async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, admin, DESKTOP);
    await page.goto('/settings/branches');
    await expect(page.getByTestId('branches-list')).toBeVisible();
    await page.getByTestId('branch-new').click();
    await expect(page).toHaveURL(/\/settings\/branches\/new$/);

    await input(page, 'code').fill('B4');
    await input(page, 'name_mm', 0).fill('ပွိုင့် ၄.၀');
    await input(page, 'name_mm', 1).fill('Point 4.0');
    const created = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/api/v1/branches'),
    );
    await page.getByTestId('branch-save').click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/settings\/branches\/[0-9a-f-]{36}$/);
    // On the detail the code is text, not an input (owner BR1).
    await expect(page.getByTestId('branch-field-code')).toContainText('B4');
    await expect(page.getByTestId('branch-field-code').getByRole('textbox')).toHaveCount(0);
    await expect(badge(page)).toHaveCount(0);

    await input(page, 'phone').fill(B4_PHONE);
    const updated = page.waitForResponse((res) => res.request().method() === 'PATCH');
    await page.getByTestId('branch-save').click();
    const patch = await updated;
    expect(patch.status()).toBe(200);
    expect(((await patch.json()) as { phone: string | null }).phone).toBe(B4_PHONE);

    const dialog = await deactivate(page, 'Not opening this year');
    await expect(dialog).toBeHidden();
    await expect(badge(page)).toHaveAttribute('data-tone', 'muted');
    // Re-activate is a visible button of the header; Deactivate was behind the ⋮.
    await expect(page.getByTestId('branch-reactivate')).toBeVisible();
    await expect(headerMenu(page)).toHaveCount(0);

    await page.goto('/settings/branches');
    await chip(page, 'inactive').click();
    await expect(page.getByTestId('branch-row-B4')).toBeVisible();
    await expect(page.getByTestId('branch-row-B3')).toHaveCount(0);

    await page.getByTestId('branch-row-B4').click();
    await expect(page.getByTestId('branch-reactivate')).toBeVisible();
    const reactivated = page.waitForResponse((res) => res.url().endsWith('/status'));
    await page.getByTestId('branch-reactivate').click();
    expect((await reactivated).status()).toBe(200);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(badge(page)).toHaveCount(0);
    await expect(page.getByTestId('branch-reactivate')).toHaveCount(0);
    await expect(headerMenu(page)).toBeVisible();
    await context.close();
  });

  test('5.2 — Ma Hnin sees Branches on More, one card B3, read-only values and no status action; Ko Aung sees no Branches and the forbidden page (360 × 800)', async ({
    browser,
  }) => {
    const manager = await pageAs(browser, hnin, MOBILE);
    await manager.page.goto('/more');
    await manager.page.getByTestId('more-settings-branches').click();
    await expect(manager.page).toHaveURL(/\/settings\/branches$/);
    await expect(manager.page.getByTestId('branch-row-B3')).toBeVisible();
    await expect(manager.page.locator('[data-testid^="branch-row-"]')).toHaveCount(1);
    await expect(manager.page.getByTestId('branch-new')).toHaveCount(0);

    await manager.page.getByTestId('branch-row-B3').click();
    await expect(manager.page).toHaveURL(new RegExp(`/settings/branches/${B3}$`));
    await expect(manager.page.getByTestId('branch-form')).toBeVisible();
    await expect(manager.page.getByTestId('branch-form').getByRole('textbox')).toHaveCount(0);
    await expect(manager.page.getByTestId('branch-save')).toHaveCount(0);
    await expect(manager.page.getByTestId('branch-reactivate')).toHaveCount(0);
    await expect(headerMenu(manager.page)).toHaveCount(0);
    await manager.context.close();

    const barber = await pageAs(browser, aung, MOBILE);
    await barber.page.goto('/more');
    await expect(barber.page.getByTestId('more')).toBeVisible();
    await expect(barber.page.getByTestId('more-settings-branches')).toHaveCount(0);
    await barber.page.goto('/settings/branches');
    await expect(barber.page.getByTestId('refused-page')).toContainText(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    await expect(barber.page.getByTestId('refused-page').getByRole('link')).toHaveAttribute(
      'href',
      '/',
    );
    await expect(barber.page.getByTestId('branches-list')).toHaveCount(0);
    await barber.context.close();
  });

  test('5.3 — deactivating B3 shows the in-use counts in the dialog and B3 stays Active (1280 × 800)', async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, admin, DESKTOP);
    await page.goto(`/settings/branches/${B3}`);
    await expect(badge(page)).toHaveCount(0);
    const refused = page.waitForResponse((res) => res.url().endsWith('/status'));
    const dialog = await deactivate(page);
    expect((await refused).status()).toBe(409);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('branch-in-use')).toHaveText(
      'This branch still has 5 assigned staff, 0 open bookings and 0 open sales.',
    );
    await dialog.getByRole('button').first().click();
    await expect(dialog).toBeHidden();
    await expect(badge(page)).toHaveCount(0);
    const stored = await adminApi.get(`/api/v1/branches/${B3}`);
    expect(((await stored.json()) as { status: number }).status).toBe(1);
    await context.close();
  });
});
