import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { restartApi, sql } from './helpers/stack.js';
import {
  MOBILE,
  PEOPLE,
  type Session,
  apiAs,
  clearOpenVisits,
  nextReceipt,
  pageAs,
  sessionOf,
  setLanguage,
  walkinViolations,
} from './helpers/walkin.js';

// add-late-entry group 5 — the late-entry flows end to end on the stack (AD-QA-03 · AD-POS-14 ·
// D-VIS-13 · LE-2 / LE-3 ★): Ko Aung enters yesterday's paper walk-in — yesterday read from the server's
// clock (`system.server_time`), never the machine's. Elements by test id or role, never by text
// (CG-TEST-06). Code requests in this file: 1, verifies: 1 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let aung: Session;
let aungApi: APIRequestContext;
/** Yesterday in Myanmar time: `2026-10-04` and how the date field takes it, `04/Oct/2026`. */
let yesterday: { iso: string; typed: string };

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  aung = await sessionOf(playwright, PEOPLE.aung);
  aungApi = await apiAs(playwright, aung);
  const me = (await (await aungApi.get('/api/v1/me')).json()) as {
    system: { server_time: string };
  };
  // server_time is written in +06:30: its date part is the Myanmar date (D-PLT-15).
  const today = new Date(`${me.system.server_time.slice(0, 10)}T00:00:00Z`);
  const day = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const iso = day.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  yesterday = { iso, typed: `${d}/${MONTHS[Number(m) - 1]}/${y}` };
});
test.beforeEach(() => {
  walkinViolations.length = 0;
});
test.afterEach(() => {
  expect(walkinViolations, 'securitypolicyviolation events').toStrictEqual([]);
});
test.afterAll(async () => {
  await aungApi.dispose();
});

/** `HH:mm` as the time list shows it, "3:30 PM" (D-PLT-05 — the same in both languages). */
function shownTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const marker = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')} ${marker}`;
}

/**
 * The time `HH:mm` of the field `late-entry-<key>`, as a person chooses it: press the time's combobox,
 * type the time as it is shown into its search field, press the time's option. The popover is portaled
 * to the end of the page; the trigger's `aria-controls` names it.
 */
async function chooseTime(page: Page, key: string, time: string): Promise<void> {
  const trigger = page.getByTestId(`late-entry-${key}`).getByTestId(`late-entry-${key}-time`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popup = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
  await popup.getByRole('combobox').fill(shownTime(time));
  await popup.getByTestId(`late-entry-${key}-time-${time}`).click();
}

/** One time field of a late entry: yesterday and the time of day `HH:mm`. */
async function fillTime(page: Page, key: string, time: string): Promise<void> {
  const field = page.getByTestId(`late-entry-${key}`);
  const date = field.getByRole('textbox');
  await date.fill(yesterday.typed);
  await date.blur();
  await chooseTime(page, key, time);
}

/** The START sheet of a late entry: INTERNET_OUTAGE, Haircut, the four times of the paper slip. */
async function startLate(page: Page): Promise<string> {
  await page.goto('/visits/new');
  await page.getByTestId('arrival-walk-in').click();
  await expect(page.getByTestId('start-chips')).toBeVisible();
  await page.getByTestId('start-chips').getByRole('button').first().click();
  await page.getByTestId('late-entry-link').click();
  await page.getByTestId('late-entry-reason-1').check();
  await fillTime(page, 'started', '15:00');
  await fillTime(page, 'completed', '15:30');
  await fillTime(page, 'received', '15:35');
  await fillTime(page, 'finished', '15:35');
  await page.getByTestId('start-submit').click();
  await expect(page.getByTestId('visit-in-progress')).toBeVisible();
  return new URL(page.url()).pathname;
}

async function finishWithPdf(page: Page): Promise<string> {
  const pdf = page.waitForResponse((res) => res.url().includes('/receipt?format=pdf'));
  await page.getByTestId('finish-submit').click();
  await expect(page.getByTestId('success-panel')).toBeVisible();
  const answer = await pdf;
  expect(answer.status()).toBe(200);
  expect(answer.headers()['content-type']).toContain('application/pdf');
  return (await page.getByTestId('success-number').textContent()) ?? '';
}

test.describe('5.1 Flow "late entry" — yesterday\'s paper walk-in, Haircut, Cash', () => {
  for (const [name, language] of [
    ['MM at 360 × 800', 'my'],
    ['EN at 360 × 800', 'en'],
  ] as const) {
    test(name, async ({ browser }) => {
      setLanguage(PEOPLE.aung, language);
      await clearOpenVisits(aungApi);
      const { context, page } = await pageAs(browser, aung, MOBILE);
      const sale = await startLate(page);
      await expect(
        page.getByTestId('visit-header').locator('[data-slot="flag-chip"]'),
      ).toBeVisible();
      // Today lists the open visit with the flag.
      await page.goto('/today');
      await expect(
        page.getByTestId('today').locator('[data-slot="flag-chip"]').first(),
      ).toBeVisible();
      await page.goto(sale);
      // The kept times: no time field asks, each step sends the paper slip's time.
      await page.getByTestId('visit-done').click();
      await expect(page.getByTestId('checkout')).toBeVisible();
      await expect(page.getByTestId('late-entry-received')).toHaveCount(0);
      await page.getByTestId('pay-CASH').click();
      await expect(page.getByTestId('late-entry-finished')).toHaveCount(0);
      const expected = await nextReceipt(aungApi, 'sale', 'B3', yesterday.iso);
      expect(await finishWithPdf(page)).toBe(expected);
      await context.close();
    });
  }
});

test.describe('5.2 Without the code, and on a closed day', () => {
  test('a Barber role without sale.late_entry sees no link', async ({ browser }) => {
    setLanguage(PEOPLE.aung, 'en');
    // The seed Barber role without the code for this test, put back after it (owner B12: a barber
    // without late entry gets a role without `sale.late_entry`).
    const kept = sql(
      `SELECT rp.id || ',' || rp.role_id || ',' || rp.permission_id FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name_en = 'Barber' AND p.code = 'sale.late_entry';`,
    ).trim();
    const [rowId, roleId, permissionId] = kept.split(',');
    expect(rowId, 'the seed Barber role holds sale.late_entry').toBeTruthy();
    sql(`DELETE FROM role_permissions WHERE id = '${rowId}';`);
    try {
      const { context, page } = await pageAs(browser, aung, MOBILE);
      await page.goto('/visits/new');
      await page.getByTestId('arrival-walk-in').click();
      await expect(page.getByTestId('start-submit')).toBeVisible();
      await expect(page.getByTestId('late-entry-link')).toHaveCount(0);
      await context.close();
    } finally {
      sql(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         VALUES ('${rowId}', '${roleId}', '${permissionId}') ON CONFLICT DO NOTHING;`,
      );
    }
  });

  test('a CLOSED yesterday — the sheet shows the closed-day banner, nothing is created', async ({
    browser,
  }) => {
    setLanguage(PEOPLE.aung, 'en');
    await clearOpenVisits(aungApi);
    const closing = '0199a3f2-0000-7000-8000-00000000e2e5';
    sql(`INSERT INTO daily_closings (id, branch_id, business_date, status, counted_cash_amount, closed_at, closed_by_user_id)
         SELECT '${closing}', b.id, '${yesterday.iso}', 2, 0, now(), u.id
         FROM branches b, users u WHERE b.code = 'B3' AND u.email = '${PEOPLE.min}'
         ON CONFLICT DO NOTHING;`);
    try {
      const { context, page } = await pageAs(browser, aung, MOBILE);
      await page.goto('/visits/new');
      await page.getByTestId('arrival-walk-in').click();
      await expect(page.getByTestId('start-chips')).toBeVisible();
      await page.getByTestId('late-entry-link').click();
      await page.getByTestId('late-entry-reason-1').check();
      await fillTime(page, 'started', '15:00');
      await fillTime(page, 'completed', '15:30');
      await fillTime(page, 'received', '15:35');
      await fillTime(page, 'finished', '15:35');
      await page.getByTestId('start-submit').click();
      await expect(page.locator('[data-slot="lock-banner"]')).toBeVisible();
      await expect(page.getByTestId('visit-in-progress')).toHaveCount(0);
      await context.close();
    } finally {
      sql(`DELETE FROM daily_closings WHERE id = '${closing}';`);
    }
  });
});

test.describe('5.3 Continue on another device after START (LE-3)', () => {
  for (const language of ['my', 'en'] as const) {
    // Myanmar is the wider of the two: the flag, the status and the running time must wrap (AD-QA-01).
    test(`a flagged visit fits Today at 320 px (${language})`, async ({ browser }) => {
      setLanguage(PEOPLE.aung, language);
      await clearOpenVisits(aungApi);
      const { context, page } = await pageAs(browser, aung, { width: 320, height: 800 });
      await startLate(page);
      await page.goto('/');
      await expect(page.getByTestId('today')).toBeVisible();
      await expect(page.locator('[data-slot="card-list"]')).toBeVisible();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(320);
      await context.close();
      setLanguage(PEOPLE.aung, 'en');
      await clearOpenVisits(aungApi);
    });
  }

  test('"Completed time" is asked first, then each later time; the sale lands on yesterday', async ({
    browser,
  }) => {
    setLanguage(PEOPLE.aung, 'en');
    await clearOpenVisits(aungApi);
    const first = await pageAs(browser, aung, MOBILE);
    const sale = await startLate(first.page);
    await first.context.close();

    // A fresh context has no storage: the kept times are not here.
    const { context, page } = await pageAs(browser, aung, MOBILE);
    await page.goto(sale);
    await page.getByTestId('visit-done').click();
    await expect(page.getByTestId('late-entry-completed')).toBeVisible();
    await expect(page.getByTestId('visit-in-progress')).toBeVisible();
    await fillTime(page, 'completed', '15:30');
    await page.getByTestId('visit-done').click();
    await expect(page.getByTestId('checkout')).toBeVisible();

    await page.getByTestId('pay-CASH').click();
    await expect(page.getByTestId('late-entry-received')).toBeVisible();
    await fillTime(page, 'received', '15:35');
    await page.getByTestId('pay-CASH').click();
    await expect(page.getByTestId('finish-submit')).toBeEnabled();

    await page.getByTestId('finish-submit').click();
    await expect(page.getByTestId('late-entry-finished')).toBeVisible();
    await fillTime(page, 'finished', '15:35');
    const expected = await nextReceipt(aungApi, 'sale', 'B3', yesterday.iso);
    expect(await finishWithPdf(page)).toBe(expected);
    await context.close();
  });
});
