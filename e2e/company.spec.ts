import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { pdfText } from './helpers/pdf.js';
import { restartApi, sql } from './helpers/stack.js';
import {
  DESKTOP,
  MOBILE,
  PEOPLE,
  type Session,
  apiAs,
  clearOpenVisits,
  pageAs,
  sessionOf,
  setLanguage,
  walkinViolations,
} from './helpers/walkin.js';

// add-company-profile group 5 — Settings › Company end to end on the stack (AD-QA-01 · AD-QA-03 ·
// AD-NAV-02 · AD-RT-02 · AD-RCPT-01 · CP3 · D-PAY-06): U Kyaw Zin (Admin, company scope) edits the
// company from More on a phone and from the rail on a laptop, in Myanmar and in English; Ko Aung (Barber
// B3) has no entry and gets the "no access" page; two windows of the admin meet the 409 banner; an edited
// English name is the first text of the next walk-in's receipt PDF. The company row is put back to the
// fixture (spec-fixtures §1: the names, no contacts, no links) before every test and after the file, so
// no other spec sees the edits. Elements by test id or by their address, never by text (CG-TEST-06).
// Code requests in this file: 2, verifies: 2 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

const KYAW_ZIN = 'kyawzin@point.test';
const NAME_EN = 'Point Barbershop';
const NAME_MM = 'ပွိုင့် ဘာဘာရှော့';
const NEW_NAME_EN = 'Point Barbershop Yangon';
/** The contact rows of spec-fixtures §1 (add-company-profile brief, "Data"). */
const CONTACTS = {
  'company-phone': '09 400 000 111',
  'company-email': 'hello@point.test',
  'company-address-mm': 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း၊ ရန်ကုန်',
  'company-address-en': 'No. 12, Test Street, Yangon',
  'company-website': 'https://point.test',
  'company-link-facebook': 'https://www.facebook.com/point.test',
  'company-link-tiktok': 'https://www.tiktok.com/@point.test',
  'company-link-viber': '09 400 000 111',
} as const;
const ENTRY = 'a[href="/settings/company"]';

let kyawZin: Session;
let aung: Session;

/** The company as the fixture has it: the two names, every other profile member empty. */
function resetCompany(): void {
  sql(`UPDATE companies SET name_mm = '${NAME_MM}', name_en = '${NAME_EN}', phone = NULL,
       email = NULL, address_mm = NULL, address_en = NULL, website_url = NULL, social_links = NULL,
       updated_at = now();`);
}

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  kyawZin = await sessionOf(playwright, KYAW_ZIN);
  aung = await sessionOf(playwright, PEOPLE.aung);
});
test.beforeEach(() => {
  resetCompany();
  walkinViolations.length = 0;
});
test.afterEach(() => {
  expect(walkinViolations, 'securitypolicyviolation events').toStrictEqual([]);
});
test.afterAll(() => {
  resetCompany();
  // Both accounts back to the seed's language (none — the system default), as global-setup left them.
  sql(`UPDATE users SET ui_language = NULL WHERE email IN ('${KYAW_ZIN}', '${PEOPLE.aung}');`);
});

/** Fills the contacts, the website and the three fixture links, saves, and waits for the 200. */
async function saveContacts(page: Page): Promise<void> {
  for (const [testId, value] of Object.entries(CONTACTS)) {
    await page.getByTestId(testId).fill(value);
  }
  const saved = page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/company') && res.request().method() === 'PATCH',
  );
  await page.getByTestId('company-save').click();
  expect((await saved).status()).toBe(200);
}

/** After a reload the form shows every saved value. */
async function expectContacts(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('company-form')).toBeVisible();
  for (const [testId, value] of Object.entries(CONTACTS)) {
    await expect(page.getByTestId(testId)).toHaveValue(value);
  }
}

/** No horizontal page scroll (AD-LAY-03 · AD-QA-01). */
async function expectNoSideScroll(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: window.innerWidth,
  }));
  expect(width.page).toBeLessThanOrEqual(width.window);
}

test.describe('5.1 U Kyaw Zin saves the contacts; Ko Aung has no entry', () => {
  for (const language of ['my', 'en'] as const) {
    test(`${language.toUpperCase()} at 360 × 800 — from More`, async ({ browser }) => {
      setLanguage(KYAW_ZIN, language);
      const { context, page } = await pageAs(browser, kyawZin, MOBILE);
      await page.goto('/more');
      await page.getByTestId('more-settings-company').click();
      await expect(page).toHaveURL(/\/settings\/company$/);
      await expect(page.getByTestId('company-form')).toBeVisible();
      await expectNoSideScroll(page);
      await saveContacts(page);
      await expectContacts(page);
      await expectNoSideScroll(page);
      await context.close();
    });

    test(`${language.toUpperCase()} at 1280 × 800 — from the rail`, async ({ browser }) => {
      setLanguage(KYAW_ZIN, language);
      const { context, page } = await pageAs(browser, kyawZin, DESKTOP);
      await page.goto('/today');
      await page.locator(`[data-slot="rail"] ${ENTRY}`).click();
      await expect(page).toHaveURL(/\/settings\/company$/);
      await expect(page.locator(`[data-slot="sub-nav"] ${ENTRY}`)).toHaveAttribute(
        'aria-current',
        'page',
      );
      await saveContacts(page);
      await expectContacts(page);
      await context.close();
    });
  }

  test('Ko Aung — no entry in More or the rail; /settings/company is the "no access" page', async ({
    browser,
  }) => {
    setLanguage(PEOPLE.aung, 'en');
    const phone = await pageAs(browser, aung, MOBILE);
    await phone.page.goto('/more');
    await expect(phone.page.getByTestId('more-name')).toBeVisible();
    await expect(phone.page.getByTestId('more-settings')).toHaveCount(0);
    await phone.context.close();

    const laptop = await pageAs(browser, aung, DESKTOP);
    await laptop.page.goto('/today');
    await expect(laptop.page.locator('[data-slot="rail"] a').first()).toBeVisible();
    await expect(laptop.page.locator(`[data-slot="rail"] ${ENTRY}`)).toHaveCount(0);
    await laptop.page.goto('/settings/company');
    await expect(laptop.page.getByTestId('refused-page')).toBeVisible();
    await expect(laptop.page.getByTestId('company-form')).toHaveCount(0);
    await laptop.context.close();
  });
});

test('5.2 two windows of U Kyaw Zin — the second save answers 409 and shows the banner; Reload shows the first save', async ({
  browser,
}) => {
  setLanguage(KYAW_ZIN, 'en');
  const laptop = await pageAs(browser, kyawZin, DESKTOP);
  const phone = await pageAs(browser, kyawZin, MOBILE);
  for (const { page } of [laptop, phone]) {
    await page.goto('/settings/company');
    await expect(page.getByTestId('company-form')).toBeVisible();
  }

  await phone.page.getByTestId('company-phone').fill(CONTACTS['company-phone']);
  const first = phone.page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/company') && res.request().method() === 'PATCH',
  );
  await phone.page.getByTestId('company-save').click();
  expect((await first).status()).toBe(200);

  await laptop.page.getByTestId('company-email').fill(CONTACTS['company-email']);
  const second = laptop.page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/company') && res.request().method() === 'PATCH',
  );
  await laptop.page.getByTestId('company-save').click();
  expect((await second).status()).toBe(409);
  await expect(laptop.page.getByTestId('company-conflict')).toBeVisible();
  await expect(laptop.page.getByTestId('company-email')).toHaveValue(CONTACTS['company-email']);

  await laptop.page.getByTestId('company-reload').click();
  await expect(laptop.page.getByTestId('company-conflict')).toHaveCount(0);
  await expect(laptop.page.getByTestId('company-phone')).toHaveValue(CONTACTS['company-phone']);
  await expect(laptop.page.getByTestId('company-email')).toHaveValue('');
  await laptop.context.close();
  await phone.context.close();
});

test("5.3 the English name changed on the form — the next walk-in's receipt PDF starts with it", async ({
  browser,
  playwright,
}) => {
  setLanguage(KYAW_ZIN, 'en');
  setLanguage(PEOPLE.aung, 'en');
  const admin = await pageAs(browser, kyawZin, DESKTOP);
  await admin.page.goto('/settings/company');
  await admin.page.getByTestId('company-name-en').fill(NEW_NAME_EN);
  const saved = admin.page.waitForResponse(
    (res) => res.url().endsWith('/api/v1/company') && res.request().method() === 'PATCH',
  );
  await admin.page.getByTestId('company-save').click();
  expect((await saved).status()).toBe(200);
  await admin.context.close();

  // Ko Aung's next walk-in: Haircut, cash, Finish — the success panel loads the receipt PDF.
  const aungApi = await apiAs(playwright, aung);
  try {
    await clearOpenVisits(aungApi);
  } finally {
    await aungApi.dispose();
  }
  const { context, page } = await pageAs(browser, aung, MOBILE);
  await page.goto('/visits/new');
  await page.getByTestId('arrival-walk-in').click();
  await expect(page.getByTestId('start-chips')).toBeVisible();
  await page.getByTestId('start-chips').getByRole('button').first().click();
  await page.getByTestId('start-submit').click();
  await expect(page.getByTestId('visit-in-progress')).toBeVisible();
  await page.getByTestId('visit-done').click();
  await expect(page.getByTestId('checkout')).toBeVisible();
  await page.getByTestId('pay-CASH').click();
  const pdf = page.waitForResponse((res) => res.url().includes('/receipt?format=pdf'));
  await page.getByTestId('finish-submit').click();
  await expect(page.getByTestId('success-panel')).toBeVisible();
  const answer = await pdf;
  expect(answer.status()).toBe(200);
  // The page reads the file as a Blob, and Chromium then hands the response's bytes to the Blob without
  // passing them to the inspector, so `answer.body()` is empty (CI run 41968379042). The same file is
  // read again with the context's own cookies.
  const file = await context.request.get(answer.url());
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('application/pdf');
  const text = await pdfText(await file.body());
  expect(text.trimStart().startsWith(NEW_NAME_EN), `receipt text: ${text.slice(0, 80)}`).toBe(true);
  await context.close();
});
