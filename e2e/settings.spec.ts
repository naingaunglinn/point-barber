import { randomUUID } from 'node:crypto';

import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { APP_HEADERS } from './helpers/sign-in.js';
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

// add-settings-store tasks 7.1 – 7.4 — the settings flows end to end on the stack (AD-SET-01 – 03 ·
// AD-NAV-08 · D-PLT-08 · API-AUTH-06 · AD-RCPT-01 · owner SS1 / SS3 = C · design D12): U Kyaw Zin (the admin,
// 1280 × 800 EN), Ma Hnin (the B3 manager, 360 × 800 MM) and Ko Aung (a B3 barber, 360 × 800 MM). The
// settings are company-wide and the suite shares one database, so every flow puts back what it set —
// through the reset endpoints, and maintenance is always turned off again. Elements by test id or role,
// never by text (CG-TEST-06). Code requests in this file: 3, verifies: 3 (≤ 8 each — e2e/README.md).

test.describe.configure({ mode: 'serial' });

const KYAW_ZIN = 'kyawzin@point.test';
const FEE = 'home_service.transport_fee_amount';
const SLOT = 'booking.slot_interval_minutes';
const THANKS = 'receipt.thank_you_text';

let admin: Session;
let hnin: Session;
let aung: Session;
let adminApi: APIRequestContext;
let aungApi: APIRequestContext;
const branchId = (code: string) => sql(`SELECT id FROM branches WHERE code = '${code}';`).trim();

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
  setLanguage(KYAW_ZIN, 'en');
  setLanguage(PEOPLE.hnin, 'my');
  setLanguage(PEOPLE.aung, 'my');
  admin = await sessionOf(playwright, KYAW_ZIN);
  hnin = await sessionOf(playwright, PEOPLE.hnin);
  aung = await sessionOf(playwright, PEOPLE.aung);
  adminApi = await apiAs(playwright, admin);
  aungApi = await apiAs(playwright, aung);
});
test.afterEach(() => {
  try {
    expect(walkinViolations, 'securitypolicyviolation events').toStrictEqual([]);
  } finally {
    walkinViolations.length = 0;
  }
});
test.afterAll(async () => {
  await adminApi.dispose();
  await aungApi.dispose();
});

/** P1.SET.04 through the admin's session: the company value, or one branch back to its parent. */
async function reset(key: string, branch?: string): Promise<void> {
  const res = await adminApi.post(`/api/v1/settings/${key}/reset`, {
    headers: APP_HEADERS,
    data: branch === undefined ? {} : { branch_id: branch },
  });
  expect(res.status(), `reset ${key}`).toBe(200);
}

/** Save a row (or a branch form) and confirm its impact note. */
async function saveWithImpactNote(page: Page, form: string): Promise<void> {
  await page.getByTestId(`${form}-save`).click();
  const step = page.getByRole('alertdialog');
  await expect(step).toBeVisible();
  // The confirm step's buttons in page order: Close, Go back, the confirmation (ConfirmDialog).
  await step.getByRole('button').last().click();
  await expect(step).toBeHidden();
}

test('7.1 Flow "company value and override" — 2,000 for the company, 3,000 at Point 3.0', async ({
  browser,
}) => {
  const b1 = branchId('B1');
  const b2 = branchId('B2');
  const b3 = branchId('B3');
  try {
    // U Kyaw Zin sets the company transport fee to 2,000 through its impact note.
    const desk = await pageAs(browser, admin, DESKTOP);
    await desk.page.goto('/settings/additional');
    const row = desk.page.getByTestId(`setting-${FEE}-row`);
    await row.getByRole('textbox').fill('2000');
    await saveWithImpactNote(desk.page, `setting-${FEE}`);
    await expect(row.locator('[data-slot="setting-source"]')).toHaveAttribute(
      'data-source',
      'company',
    );

    // Ma Hnin sets the B3 override to 3,000 through the same note and sees Point 3.0 only.
    const phone = await pageAs(browser, hnin, MOBILE);
    await phone.page.goto('/settings/additional');
    await phone.page.getByTestId(`setting-${FEE}-overrides-open`).click();
    const mine = phone.page.getByTestId(`setting-${FEE}-branch-${b3}`);
    await expect(mine).toBeVisible();
    await expect(phone.page.getByTestId(`setting-${FEE}-branch-${b1}`)).toHaveCount(0);
    await mine.getByRole('textbox').fill('3000');
    await saveWithImpactNote(phone.page, `setting-${FEE}-branch-${b3}-form`);
    await expect(mine.locator('[data-slot="setting-source"]').first()).toHaveAttribute(
      'data-source',
      'branch',
    );
    await phone.context.close();

    // U Kyaw Zin's override list: Point 1.0 and 2.0 at 2,000 Company, Point 3.0 at 3,000 Branch override.
    await desk.page.reload();
    await desk.page.getByTestId(`setting-${FEE}-overrides-open`).click();
    for (const [id, value, source] of [
      [b1, '2,000 Ks', 'company'],
      [b2, '2,000 Ks', 'company'],
      [b3, '3,000 Ks', 'branch'],
    ] as const) {
      const line = desk.page.getByTestId(`setting-${FEE}-branch-${id}`);
      await expect(line.getByTestId(`setting-${FEE}-branch-${id}-value`)).toHaveText(value);
      await expect(line.locator('[data-slot="setting-source"]').first()).toHaveAttribute(
        'data-source',
        source,
      );
    }
    await expect(desk.page.getByTestId(`setting-${FEE}-branch-${b3}-reset`)).toBeVisible();
    await desk.context.close();
  } finally {
    // The company value back to the default, then B3 back to that value (reset copies the parent).
    await reset(FEE);
    await reset(FEE, b3);
  }
});

test('7.2 Flow "impact note and history" — the slot interval 15 → 30 and its history line', async ({
  browser,
}) => {
  try {
    const { context, page } = await pageAs(browser, admin, DESKTOP);
    await page.goto('/settings/additional');
    const row = page.getByTestId(`setting-${SLOT}-row`);
    await row.getByTestId(`setting-${SLOT}-choice-30`).click();
    await saveWithImpactNote(page, `setting-${SLOT}`);
    await expect(row.locator('[data-slot="setting-source"]')).toHaveAttribute(
      'data-source',
      'company',
    );
    await page.getByTestId(`setting-${SLOT}-history-open`).click();
    const first = page.getByTestId('setting-history-line').first();
    await expect(first).toContainText('U Kyaw Zin');
    await expect(first).toContainText('15 min → 30 min');
    await context.close();
  } finally {
    await reset(SLOT);
  }
});

test('7.3 Flow "maintenance" — on with an expected end, the notice on the phone, off, Try again', async ({
  browser,
}) => {
  try {
    const desk = await pageAs(browser, admin, DESKTOP);
    await desk.page.goto('/settings/maintenance');
    await desk.page.getByTestId('maintenance-switch').click();
    // The expected end: today (the server's date) at 11:55 PM.
    const me = (await (await adminApi.get('/api/v1/me')).json()) as {
      system: { server_time: string };
    };
    const [year, month, day] = me.system.server_time.slice(0, 10).split('-') as [
      string,
      string,
      string,
    ];
    const MONTHS = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const until = desk.page.getByTestId('maintenance-until');
    const date = until.getByRole('textbox');
    await date.fill(`${day}/${MONTHS[Number(month) - 1] ?? ''}/${year}`);
    await date.blur();
    await until.getByTestId('maintenance-until-time').click();
    await desk.page.getByPlaceholder('Search').fill('11:55 PM');
    await desk.page.getByTestId('maintenance-until-time-23:55').click();
    await desk.page.locator('[data-slot="bilingual-input"] input[lang="en"]').fill('Server update');
    await desk.page.getByTestId('maintenance-save').click();
    await expect(desk.page.getByTestId('maintenance-banner')).toBeVisible();

    // Ko Aung's phone shows the notice with the expected end.
    const phone = await pageAs(browser, aung, MOBILE);
    await phone.page.goto('/today');
    await expect(phone.page.getByTestId('maintenance-notice')).toBeVisible();
    await expect(phone.page.getByTestId('maintenance-notice-until')).toBeVisible();
    await expect(phone.page.getByTestId('maintenance-notice-message')).toHaveText('Server update');

    // U Kyaw Zin turns it off; Ko Aung's Try again shows Today.
    await desk.page.getByTestId('maintenance-switch').click();
    await desk.page.getByTestId('maintenance-save').click();
    await expect(desk.page.getByTestId('maintenance-banner')).toHaveCount(0);
    await phone.page.getByTestId('maintenance-notice-retry').click();
    await expect(phone.page.getByTestId('today')).toBeVisible();
    await phone.context.close();
    await desk.context.close();
  } finally {
    const off = await adminApi.put('/api/v1/system/maintenance', {
      headers: APP_HEADERS,
      data: { enabled: false },
    });
    expect(off.status(), 'maintenance off').toBe(200);
  }
});

test('7.4 Flow "thank-you text" — "Thank you!" on the receipt of Ko Aung\'s cash walk-in', async ({
  browser,
}) => {
  try {
    const { context, page } = await pageAs(browser, admin, DESKTOP);
    await page.goto('/settings/additional');
    const row = page.getByTestId(`setting-${THANKS}-row`);
    await row.locator('input[lang="my"]').fill('ကျေးဇူးတင်ပါတယ်');
    await row.locator('input[lang="en"]').fill('Thank you!');
    await page.getByTestId(`setting-${THANKS}-save`).click();
    await expect(row.locator('[data-slot="setting-source"]')).toHaveAttribute(
      'data-source',
      'company',
    );
    await context.close();

    // Ko Aung finishes a cash walk-in of Haircut (his own price 10,000) at B3.
    await clearOpenVisits(aungApi);
    const haircut = sql(`SELECT id FROM services WHERE name_en = 'Haircut';`).trim();
    const cash = sql(`SELECT id FROM payment_methods WHERE code = 'CASH';`).trim();
    const started = await aungApi.post('/api/v1/visits', {
      headers: { ...APP_HEADERS, 'Idempotency-Key': randomUUID() },
      data: { branch_id: branchId('B3'), items: [{ service_id: haircut }] },
    });
    expect(started.status()).toBe(201);
    const visit = (await started.json()) as { id: string; sale: { id: string } };
    const paid = await aungApi.post(`/api/v1/sales/${visit.sale.id}/payments`, {
      headers: { ...APP_HEADERS, 'Idempotency-Key': randomUUID() },
      data: { payment_method_id: cash, amount: 10000 },
    });
    expect(paid.status()).toBe(201);
    expect(
      (
        await aungApi.post(`/api/v1/visits/${visit.id}/complete`, { headers: APP_HEADERS })
      ).status(),
    ).toBe(200);
    const finished = await aungApi.post(`/api/v1/sales/${visit.sale.id}/finish`, {
      headers: APP_HEADERS,
      data: { expected_total_amount: 10000 },
    });
    expect(finished.status()).toBe(200);

    // The receipt's footer carries the English text (the PDF's text is read back by the renderer's
    // integration test — document-renderer.int.test.ts); the PDF is served.
    const receipt = await aungApi.get(`/api/v1/sales/${visit.sale.id}/receipt?format=json`);
    expect(
      ((await receipt.json()) as { footer: { thank_you: string | null } }).footer.thank_you,
    ).toBe('Thank you!');
    const pdf = await aungApi.get(`/api/v1/sales/${visit.sale.id}/receipt?format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
  } finally {
    await reset(THANKS);
  }
});
