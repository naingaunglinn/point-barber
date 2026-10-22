import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { restartApi } from './helpers/stack.js';
import {
  DESKTOP,
  MOBILE,
  PEOPLE,
  type Session,
  apiAs,
  clearOpenVisits,
  countOf,
  giveReason,
  nextReceipt,
  pageAs,
  sessionOf,
  setLanguage,
  tapCounter,
} from './helpers/walkin.js';

// add-walkin-visit-checkout group 14 — the walk-in flows end to end on the stack (AD-QA-03 · AD-GOAL-01 ·
// D-VIS-07 / 09 / 10 · D-PAY-01 / 02 / 05 · D-CUS-03 · P4-RULE-03). Ko Aung (Haircut 10,000, his own
// price) and Ko Min (Haircut 8,000, Shave 3,000) at B3, on the real clock: each expected receipt number
// is read from the server's month and the last number at B3 (helpers/walkin.ts). Before each flow the
// person's open visits are closed through the API. Elements by test id or role, never by text
// (CG-TEST-06). Code requests in this file: 2, verifies: 2 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

let aung: Session;
let min: Session;
let aungApi: APIRequestContext;
let minApi: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  aung = await sessionOf(playwright, PEOPLE.aung);
  min = await sessionOf(playwright, PEOPLE.min);
  aungApi = await apiAs(playwright, aung);
  minApi = await apiAs(playwright, min);
});
test.afterAll(async () => {
  await aungApi.dispose();
  await minApi.dispose();
});

/** The START sheet open on /visits/new; returns once the chips are there. */
async function openStart(page: Page): Promise<void> {
  await page.goto('/visits/new');
  await page.getByTestId('arrival-walk-in').click();
  await expect(page.getByTestId('start-chips')).toBeVisible();
}

/** START with the first `chips` chips (catalogue order: Haircut, Shave, Hair wash) → the sale screen. */
async function start(page: Page, chips: number): Promise<void> {
  await openStart(page);
  for (let i = 0; i < chips; i += 1) {
    await page.getByTestId('start-chips').getByRole('button').nth(i).click();
  }
  await page.getByTestId('start-submit').click();
  await expect(page.getByTestId('visit-in-progress')).toBeVisible();
}

async function complete(page: Page): Promise<void> {
  await page.getByTestId('visit-done').click();
  await expect(page.getByTestId('checkout')).toBeVisible();
}

async function payInSheet(
  page: Page,
  method: 'CASH' | 'KBZPAY' | null,
  amount: string | null,
  reference?: string,
): Promise<void> {
  const sheet = page.getByRole('dialog');
  if (method !== null) await sheet.getByTestId(`payment-method-${method}`).check();
  if (amount !== null) await sheet.getByTestId('payment-amount').locator('input').fill(amount);
  if (reference !== undefined) {
    await sheet.getByTestId('payment-reference-field').locator('input').fill(reference);
  }
  await sheet.getByTestId('payment-submit').click();
}

async function finishSkip(page: Page): Promise<string> {
  await page.getByTestId('finish-submit').click();
  await expect(page.getByTestId('success-panel')).toBeVisible();
  return (await page.getByTestId('success-number').textContent()) ?? '';
}

test.describe('14.3 Flow "walk-in cash" — Ko Aung, Haircut 10,000, at most 7 taps', () => {
  for (const [name, language, viewport] of [
    ['MM at 360 × 800', 'my', MOBILE],
    ['EN at 360 × 800', 'en', MOBILE],
    ['EN at 1280 × 800', 'en', DESKTOP],
  ] as const) {
    test(name, async ({ browser }) => {
      setLanguage(PEOPLE.aung, language);
      await clearOpenVisits(aungApi);
      const { context, page } = await pageAs(browser, aung, viewport);
      const counter = tapCounter();
      await page.goto('/today');
      await expect(page.getByTestId('today')).toBeVisible();
      await counter.tap(
        viewport === MOBILE
          ? page.locator('[data-slot="nav-centre"]')
          : page.getByTestId('today-header').getByRole('button'),
      );
      await counter.tap(page.getByTestId('arrival-walk-in'));
      await counter.tap(page.getByTestId('start-chips').getByRole('button').first());
      await counter.tap(page.getByTestId('start-submit'));
      await counter.tap(page.getByTestId('visit-done'));
      await counter.tap(page.getByTestId('pay-CASH'));
      const expected = await nextReceipt(aungApi, 'sale');
      await counter.tap(page.getByTestId('finish-submit'));
      await expect(page.getByTestId('success-number')).toHaveText(expected);
      expect(counter.count).toBeLessThanOrEqual(7);
      const pdf = page.waitForResponse((res) => res.url().includes('/receipt?format=pdf'));
      await page.getByTestId('success-share').click();
      const answer = await pdf;
      expect(answer.status()).toBe(200);
      expect(answer.headers()['content-type']).toContain('application/pdf');
      await context.close();
    });
  }
});

test.describe('14.4 – 14.5 Split and over-transfer (Ko Min)', () => {
  test('14.4 Split Cash 5,000 + KBZPay 6,000 on 11,000 — remaining 6,000 → 0', async ({
    browser,
  }) => {
    setLanguage(PEOPLE.min, 'en');
    await clearOpenVisits(minApi);
    const { context, page } = await pageAs(browser, min);
    await start(page, 2);
    await complete(page);
    await page.getByTestId('pay-split').click();
    await payInSheet(page, 'CASH', '5000');
    await expect(page.getByTestId('money-remaining')).toContainText('6,000');
    await page.getByTestId('pay-split').click();
    await payInSheet(page, 'KBZPAY', '6000', 'KBZ0001234567');
    await expect(page.getByTestId('finish-submit')).toBeVisible();
    const expected = await nextReceipt(minApi, 'sale');
    expect(await finishSkip(page)).toBe(expected);
    await context.close();
  });

  test('14.5 Over-transfer: KBZPay 10,000 on 8,000 → change 2,000 → the RF number', async ({
    browser,
  }) => {
    await clearOpenVisits(minApi);
    const { context, page } = await pageAs(browser, min);
    await start(page, 1);
    await complete(page);
    await page.getByTestId('pay-KBZPAY').click();
    await payInSheet(page, null, '10000', 'KBZ0001234591');
    await expect(page.getByTestId('money-change')).toContainText('2,000');
    const refund = await nextReceipt(minApi, 'refund');
    await finishSkip(page);
    await expect(page.getByTestId('success-change')).toContainText(refund);
    await context.close();
  });
});

test.describe('14.6 Negative flows', () => {
  test('the unpaid-visit block and its link; mark incomplete', async ({ browser }) => {
    setLanguage(PEOPLE.aung, 'en');
    await clearOpenVisits(aungApi);
    const { context, page } = await pageAs(browser, aung);
    await start(page, 1);
    await complete(page);
    const waiting = page.url();
    await openStart(page);
    await page.getByTestId('start-submit').click();
    const block = page.getByTestId('start-unpaid');
    await expect(block).toBeVisible();
    await block.getByRole('button').click();
    await expect(page).toHaveURL(waiting);
    await page.getByTestId('visit-more').click();
    await page.getByTestId('visit-incomplete').click();
    await giveReason(page, 'Customer left without paying');
    await expect(page.getByTestId('sale-cancelled')).toBeVisible();
    await context.close();
  });

  test('void and re-pay', async ({ browser }) => {
    await clearOpenVisits(aungApi);
    const { context, page } = await pageAs(browser, aung);
    await start(page, 1);
    await complete(page);
    await page.getByTestId('pay-CASH').click();
    await expect(page.getByTestId('finish-submit')).toBeVisible();
    await page.getByTestId('payment-void').click();
    await giveReason(page, 'Customer pays by KBZPay instead');
    await expect(page.getByTestId('pay-CASH')).toBeVisible();
    await page.getByTestId('pay-CASH').click();
    await expect(page.getByTestId('finish-submit')).toBeVisible();
    await finishSkip(page);
    await context.close();
  });

  test('a reference already on a finished sale names that receipt', async ({ browser }) => {
    await clearOpenVisits(minApi);
    const { context, page } = await pageAs(browser, min);
    await start(page, 1);
    await complete(page);
    await page.getByTestId('pay-KBZPAY').click();
    await payInSheet(page, null, null, 'KBZ0001234567');
    await expect(page.getByRole('dialog')).toContainText(/B3-\d{4}-[A-Z]{3}-\d{5}/);
    await context.close();
    await clearOpenVisits(minApi);
  });
});

test.describe('14.7 One tap, one row — double taps and a lost reply', () => {
  test('a double tap on Start and on Cash writes one visit and one payment', async ({
    browser,
  }) => {
    await clearOpenVisits(aungApi);
    const visits = countOf('visits', PEOPLE.aung);
    const { context, page } = await pageAs(browser, aung);
    await openStart(page);
    await page.getByTestId('start-chips').getByRole('button').first().click();
    await page.getByTestId('start-submit').dblclick();
    await expect(page.getByTestId('visit-in-progress')).toBeVisible();
    expect(countOf('visits', PEOPLE.aung)).toBe(visits + 1);
    await complete(page);
    const payments = countOf('payments', PEOPLE.aung);
    await page.getByTestId('pay-CASH').dblclick();
    await expect(page.getByTestId('finish-submit')).toBeVisible();
    expect(countOf('payments', PEOPLE.aung)).toBe(payments + 1);
    await finishSkip(page);
    await context.close();
  });

  test('a lost reply of START ends with one visit, found by its key', async ({ browser }) => {
    await clearOpenVisits(aungApi);
    const visits = countOf('visits', PEOPLE.aung);
    const { context, page } = await pageAs(browser, aung);
    let lost = false;
    await page.route('**/api/v1/visits', async (route) => {
      if (route.request().method() !== 'POST' || lost) return route.continue();
      lost = true;
      await route.fetch();
      return route.abort('connectionreset');
    });
    await openStart(page);
    await page.getByTestId('start-submit').click();
    await expect(page.getByTestId('visit-in-progress')).toBeVisible();
    expect(lost).toBe(true);
    expect(countOf('visits', PEOPLE.aung)).toBe(visits + 1);
    await context.close();
    await clearOpenVisits(aungApi);
  });
});

test.describe('14.8 The customer at Finish; a colleague cannot open the sale', () => {
  let saleUrl = '';

  test("Ma Su's phone → the existing customer", async ({ browser }) => {
    await clearOpenVisits(aungApi);
    const { context, page } = await pageAs(browser, aung);
    await start(page, 1);
    await complete(page);
    await page.getByTestId('pay-CASH').click();
    await page.getByTestId('finish-phone').locator('input').fill('09 7712 3456');
    await expect(page.getByTestId('finish-customer')).toBeVisible();
    saleUrl = page.url();
    await finishSkip(page);
    await context.close();
  });

  test('Ko Phyo (new) — the name is required, then FINISH', async ({ browser }) => {
    await clearOpenVisits(aungApi);
    const { context, page } = await pageAs(browser, aung);
    await start(page, 1);
    await complete(page);
    await page.getByTestId('pay-CASH').click();
    await page.getByTestId('finish-phone').locator('input').fill('09 4500 1122');
    await expect(page.getByTestId('finish-name')).toBeVisible();
    await page.getByTestId('finish-submit').click();
    await expect(page.getByTestId('finish-name').locator('input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await page.getByTestId('finish-name').locator('input').fill('Ko Phyo');
    await finishSkip(page);
    await context.close();
  });

  test("Ko Min opens Ko Aung's sale → the forbidden page state", async ({ browser }) => {
    const { context, page } = await pageAs(browser, min);
    await page.goto(new URL(saleUrl).pathname);
    await expect(page.locator('main[data-slot="content"]').getByRole('alert')).toBeVisible();
    await expect(page.locator('main[data-slot="content"] a[href="/"]')).toBeVisible();
    await expect(page.getByTestId('sale-screen')).toHaveCount(0);
    await context.close();
  });
});

test.describe('14.9 The START sheet fits 360 × 640 without scrolling', () => {
  for (const language of ['my', 'en'] as const) {
    test(`${language === 'my' ? 'MM' : 'EN'}: branch, performer, chips and Start in view`, async ({
      browser,
    }) => {
      setLanguage(PEOPLE.aung, language);
      await clearOpenVisits(aungApi);
      const { context, page } = await pageAs(browser, aung, { width: 360, height: 640 });
      await openStart(page);
      for (const id of ['start-branch', 'start-chips', 'start-submit']) {
        await expect(page.getByTestId(id)).toBeInViewport();
      }
      // The performer chip shows the barber's name (data, not a translated label).
      await expect(
        page.getByRole('dialog').getByText(language === 'my' ? 'ကိုအောင်' : 'Ko Aung'),
      ).toBeInViewport();
      await context.close();
    });
  }
});
