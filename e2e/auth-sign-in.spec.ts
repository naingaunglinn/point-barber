import { type Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { APP_ORIGIN } from './hosts.js';
import { mailpit } from './helpers/mailpit.js';
import { APP_HEADERS, signInWithCode } from './helpers/sign-in.js';
import { restartApi, sql } from './helpers/stack.js';

// add-foundation-auth-access tasks 8.4–8.5 — signing in with the code from Mailpit, through the screens
// (P1.AUTH.01 / 02 · P1-RULE-02 · API-AUTH-01 · AD-QA-03 · D-AUTH-03 / 04). Elements are found by test
// id (CG-TEST-06). Code requests in this file: 5; verifies: 3 (≤ 8 each — e2e/README.md).

const LOCALE_COOKIE = (locale: 'my' | 'en') => ({
  name: 'point_locale',
  value: locale,
  url: APP_ORIGIN,
});

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

/** The two login steps on the screen; returns when the start page shows the name. */
async function signInOnScreen(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  const since = new Date();
  await page.getByTestId('login-send-code').click();
  await expect(page.getByTestId('login-code')).toBeVisible();
  const code = await mailpit.readCode(email, since);
  await page.getByTestId('login-code').fill(code);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('landing-name')).toBeVisible();
}

test.describe('add-foundation-auth-access · auth · signing in with an e-mail code (task 8.4)', () => {
  test('Ko Aung signs in at 360 × 800 in Myanmar', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: APP_ORIGIN,
      ignoreHTTPSErrors: true,
      viewport: { width: 360, height: 800 },
    });
    await context.addCookies([LOCALE_COOKIE('my')]);
    const page = await context.newPage();
    await signInOnScreen(page, 'aung@point.test');
    await expect(page.getByTestId('landing-name')).toHaveText('ကိုအောင်');
    await expect(page.getByTestId('landing-email')).toHaveText('aung@point.test');
    await expect(page.getByTestId('landing-branches').locator('li')).toHaveText([
      'B3 · ပွိုင့် ၃.၀',
    ]);
    const session = (await context.cookies()).find((cookie) => cookie.name === 'point_session');
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    await context.close();
  });

  test('Ko Aung signs in at 1280 × 800 in English', async ({ browser, playwright }) => {
    // A second code for the same address within 60 seconds would answer 429: start a fresh limiter.
    await restartApi(playwright);
    sql("UPDATE users SET ui_language = 2 WHERE email = 'aung@point.test';");
    const context = await browser.newContext({
      baseURL: APP_ORIGIN,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
    });
    await context.addCookies([LOCALE_COOKIE('en')]);
    const page = await context.newPage();
    await signInOnScreen(page, 'aung@point.test');
    await expect(page.getByTestId('landing-name')).toHaveText('Ko Aung');
    await expect(page.getByTestId('landing-email')).toHaveText('aung@point.test');
    await expect(page.getByTestId('landing-branches').locator('li')).toHaveText(['B3 · Point 3.0']);
    await context.close();
  });
});

test.describe('add-foundation-auth-access · auth · who may sign in (task 8.5)', () => {
  test("Ma Thida's first sign-in makes her active", async ({ app }) => {
    await signInWithCode(app, 'thida@point.test');
    const me = await app.get('/api/v1/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ user: { status: 1 }, grants: [] });
  });

  test('an unknown and a deactivated address reach the same code step, and no e-mail is sent', async ({
    page,
  }) => {
    const before = {
      nobody: await mailpit.count('nobody@point.test'),
      naing: await mailpit.count('naing@point.test'),
    };
    for (const email of ['nobody@point.test', 'naing@point.test']) {
      await page.goto('/login');
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-send-code').click();
      await expect(page.getByTestId('login-code')).toBeVisible();
      await expect(page.getByTestId('login-code-sent')).toBeVisible();
    }
    // Give the job worker the time it takes for a real address (it delivers within a second or two).
    await page.waitForTimeout(5000);
    expect(await mailpit.count('nobody@point.test')).toBe(before.nobody);
    expect(await mailpit.count('naing@point.test')).toBe(before.naing);
  });

  test('the same message for a known and an unknown address', async ({ app }) => {
    const res = await app.post('/api/v1/auth/otp/request', {
      headers: APP_HEADERS,
      data: { email: 'nobody-2@point.test' },
    });
    expect(res.status()).toBe(202);
    expect(await res.json()).toStrictEqual({ resend_after_seconds: 60 });
  });
});
