import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { restartApi, sql } from './helpers/stack.js';
import {
  DESKTOP,
  MOBILE,
  type Session,
  pageAs,
  sessionOf,
  setLanguage,
  walkinViolations,
} from './helpers/walkin.js';

// add-unsaved-changes-guard group 5 — the guard end to end on the stack (AD-FORM-08 · AD-NAV-06 · AD-QA-01 ·
// AD-QA-03 · AD-A11Y-01 · UG1 – UG5). U Kyaw Zin (Admin, company scope) edits the company phone on Settings ›
// Company: on a laptop the rail, the sub-navigation, a Ctrl-click, the language switch, a reload and Sign out;
// on a phone the bottom navigation, the centre ＋ and the browser's Back (`page.goBack()` — Chrome's own
// Back button is the manual check of task 6.3). Stored phone: `09 400 000 111`; typed: `09 400 000 112`.
// "Creating B4 opens its page without a question" is the component test of the new-branch screen: the
// branch spec owns B4 and a branch is never deleted (D-DAT-05). Elements by test id, role or address, never
// by text (CG-TEST-06). Code requests in this file: 1, verifies: 1 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

const KYAW_ZIN = 'kyawzin@point.test';
const STORED = '09 400 000 111';
const TYPED = '09 400 000 112';
const COMPANY = '/settings/company';
const RAIL_TODAY = '[data-slot="rail"] a[href="/today"]';
const NAV_TODAY = '[data-slot="bottom-nav"] a[href="/today"]';
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

let kyawZin: Session;

/** The company as the fixture has it, with the stored phone the scenarios read. */
function resetCompany(): void {
  sql(`UPDATE companies SET phone = '${STORED}', email = NULL, address_mm = NULL, address_en = NULL,
       website_url = NULL, social_links = NULL, updated_at = now();`);
}

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  kyawZin = await sessionOf(playwright, KYAW_ZIN);
});
test.beforeEach(() => {
  resetCompany();
  walkinViolations.length = 0;
});
test.afterEach(() => {
  expect(walkinViolations, 'securitypolicyviolation events').toStrictEqual([]);
});
test.afterAll(() => {
  // The company as company.spec.ts expects it (no contacts); the account back to the system language.
  sql(`UPDATE companies SET phone = NULL, updated_at = now();`);
  sql(`UPDATE users SET ui_language = NULL WHERE email = '${KYAW_ZIN}';`);
});

const phoneOf = (page: Page) => page.getByTestId('company-phone');
const question = (page: Page) => page.getByRole('alertdialog');

/** Opens the company form and types the new phone (a click first: a reload question needs an interaction). */
async function typePhone(page: Page): Promise<void> {
  await expect(page.getByTestId('company-form')).toBeVisible();
  await phoneOf(page).click();
  await phoneOf(page).fill(TYPED);
}

test.describe('5.1 laptop at 1280 × 800', () => {
  for (const language of ['en', 'my'] as const) {
    test(`${language.toUpperCase()} — the rail asks; Keep editing keeps the value; Discard opens Today and nothing is stored`, async ({
      browser,
    }) => {
      setLanguage(KYAW_ZIN, language);
      const { context, page } = await pageAs(browser, kyawZin, DESKTOP);
      await page.goto(COMPANY);
      await typePhone(page);
      await page.locator(RAIL_TODAY).click();
      await expect(question(page)).toBeVisible();
      await expect(page).toHaveURL(/\/settings\/company$/);
      await page.getByTestId('unsaved-keep-editing').click();
      await expect(question(page)).toHaveCount(0);
      await expect(phoneOf(page)).toHaveValue(TYPED);
      await expect(page).toHaveURL(/\/settings\/company$/);

      await page.locator(RAIL_TODAY).click();
      await page.getByTestId('unsaved-discard').click();
      await expect(page).toHaveURL(/\/today$/);
      await page.goto(COMPANY);
      await expect(phoneOf(page)).toHaveValue(STORED);
      await context.close();
    });
  }

  test('a sub-navigation link asks too; an untouched form does not ask', async ({ browser }) => {
    setLanguage(KYAW_ZIN, 'en');
    const { context, page } = await pageAs(browser, kyawZin, DESKTOP);
    await page.goto(COMPANY);
    await expect(page.getByTestId('company-form')).toBeVisible();
    await page.locator(RAIL_TODAY).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(question(page)).toHaveCount(0);

    await page.goto(COMPANY);
    await typePhone(page);
    await page.locator('[data-slot="sub-nav"] a[href="/settings/branches"]').click();
    await expect(question(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/company$/);
    await context.close();
  });

  test('a Ctrl-click opens a new tab without asking; the language switch keeps the value; a reload raises the browser’s question; Sign out asks', async ({
    browser,
  }) => {
    setLanguage(KYAW_ZIN, 'en');
    const { context, page } = await pageAs(browser, kyawZin, DESKTOP);
    await page.goto(COMPANY);
    await typePhone(page);

    const opened = context.waitForEvent('page');
    await page.locator(RAIL_TODAY).click({ modifiers: ['Control'] });
    const tab = await opened;
    await tab.close();
    await expect(question(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings\/company$/);
    await expect(phoneOf(page)).toHaveValue(TYPED);

    await page.locator('[data-slot="language-switch"] button[aria-pressed="false"]').click();
    await expect(page.locator('[data-slot="language-switch"] button[aria-pressed="true"]')).toBeVisible();
    await expect(question(page)).toHaveCount(0);
    await expect(phoneOf(page)).toHaveValue(TYPED);

    // The browser's own question on reload: the guard cancels `beforeunload`.
    const raised = page.waitForEvent('dialog');
    const reloading = page.reload({ timeout: 5_000 }).catch(() => undefined);
    const dialog = await raised;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await reloading;
    await expect(phoneOf(page)).toHaveValue(TYPED);

    const logouts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/logout')) logouts.push(request.url());
    });
    await page.getByTestId('user-menu-sign-out').click();
    await expect(question(page)).toBeVisible();
    expect(logouts).toStrictEqual([]);
    await page.getByTestId('unsaved-keep-editing').click();
    await expect(phoneOf(page)).toHaveValue(TYPED);
    await context.close();
  });
});

test.describe('5.2 phone at 360 × 800', () => {
  /** More → Settings › Company, the phone typed. */
  async function fromMore(page: Page): Promise<void> {
    await page.goto('/more');
    await page.getByTestId('more-settings-company').click();
    await expect(page).toHaveURL(/\/settings\/company$/);
    await typePhone(page);
  }

  test('MM — the bottom navigation and the centre ＋ ask; Discard opens the link', async ({
    browser,
  }) => {
    setLanguage(KYAW_ZIN, 'my');
    const { context, page } = await pageAs(browser, kyawZin, MOBILE);
    await fromMore(page);
    await page.locator(NAV_TODAY).click();
    await expect(question(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/company$/);
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze()).violations.map(({ id }) => id),
    ).toStrictEqual([]);
    await page.getByTestId('unsaved-keep-editing').click();
    await expect(phoneOf(page)).toHaveValue(TYPED);

    await page.locator('[data-slot="nav-centre"]').click();
    await expect(question(page)).toBeVisible();
    await page.getByTestId('unsaved-discard').click();
    await expect(page).toHaveURL(/\/visits\/new$/);
    await context.close();
  });

  test('Back asks; Keep editing, then Back asks again; Discard shows More', async ({ browser }) => {
    setLanguage(KYAW_ZIN, 'en');
    const { context, page } = await pageAs(browser, kyawZin, MOBILE);
    await fromMore(page);
    await page.goBack();
    await expect(question(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/company$/);
    await expect(phoneOf(page)).toHaveValue(TYPED);
    await page.getByTestId('unsaved-keep-editing').click();
    await expect(question(page)).toHaveCount(0);

    await page.goBack();
    await expect(question(page)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/company$/);
    await page.getByTestId('unsaved-discard').click();
    await expect(page).toHaveURL(/\/more$/);
    await context.close();
  });

  test('a link Discard, then one Back, shows the company form again; without edits Back leaves at once', async ({
    browser,
  }) => {
    setLanguage(KYAW_ZIN, 'en');
    const { context, page } = await pageAs(browser, kyawZin, MOBILE);
    await fromMore(page);
    await page.locator(NAV_TODAY).click();
    await page.getByTestId('unsaved-discard').click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/company$/);
    await expect(page.getByTestId('company-form')).toBeVisible();
    await expect(question(page)).toHaveCount(0);

    // Untouched: Back leaves at once.
    await page.goBack();
    await expect(page).toHaveURL(/\/more$/);
    await expect(question(page)).toHaveCount(0);
    await context.close();
  });
});
