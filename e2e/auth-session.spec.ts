import { type Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { APP_ORIGIN } from './hosts.js';
import { mailpit } from './helpers/mailpit.js';
import { signInAs } from './helpers/sign-in.js';
import { restartApi, sql } from './helpers/stack.js';

// add-foundation-auth-access tasks 8.7–8.8 — a lost session leads to the login screen with the reason
// and back to the same page; the language belongs to the account (AD-AUTH-01 · P1.AUTH.05 · P1.ME.02 ·
// AD-L10N-06 · D-PLT-03). Code requests in this file: 6, with an api restart before the second
// sign-in of one address; verifies: 6 (≤ 8 each — e2e/README.md).

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

async function codeStep(page: Page, email: string): Promise<void> {
  await page.getByTestId('login-email').fill(email);
  const since = new Date();
  await page.getByTestId('login-send-code').click();
  await expect(page.getByTestId('login-code')).toBeVisible();
  await page.getByTestId('login-code').fill(await mailpit.readCode(email, since));
  await page.getByTestId('login-submit').click();
}

test.describe('add-foundation-auth-access · auth · A lost session leads to the login screen with the reason and back to the same page (task 8.7)', () => {
  test('Scenario: After signing out — "You signed out"', async ({ browser, app }) => {
    sql("UPDATE users SET ui_language = 2 WHERE email = 'aung@point.test';");
    const context = await signInAs(browser, app, 'aung@point.test');
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('user-menu-sign-out').click();
    await expect(page).toHaveURL(/\/login\?reason=1$/);
    await expect(page.getByTestId('login-reason')).toHaveText('You signed out');
    await context.close();
  });

  test('Scenario: Signed out by an admin while the app is open', async ({ browser, app }) => {
    sql("UPDATE users SET ui_language = 2 WHERE email = 'min@point.test';");
    const context = await signInAs(browser, app, 'min@point.test');
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('user-menu-name')).toHaveText('Ko Min');
    sql(
      `UPDATE user_sessions SET revoked_at = now(), revoke_reason = 3
       WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = 'min@point.test');`,
    );
    await page.reload(); // the next API call answers 401 session_revoked, reason 3
    await expect(page).toHaveURL(/\/login\?reason=3/);
    await expect(page.getByTestId('login-reason')).toHaveText(
      'An admin signed you out of all devices',
    );
    await context.close();
  });

  test('Scenario: Opening the app signed out — back to /?branch=B3 after the sign-in', async ({
    page,
  }) => {
    const res = await page.goto('/?branch=B3');
    expect(res?.url()).toBe(`${APP_ORIGIN}/login?return_to=%2F%3Fbranch%3DB3`);
    await expect(page.getByTestId('login-reason')).toHaveCount(0);
    await codeStep(page, 'hnin@point.test'); // Ma Hnin: B3 is in her scope
    // `/` opens Today with the query kept (add-walkin-visit-checkout task 10.1).
    await page.waitForURL(`${APP_ORIGIN}/today?branch=B3`);
    await expect(page.getByTestId('today')).toBeVisible();
  });
});

test.describe('add-foundation-auth-access · access · A user sets their own interface language on their account (task 8.8)', () => {
  test('English is saved on the account; the next user of the browser gets their own language', async ({
    page,
    playwright,
  }) => {
    await page.goto('/login');
    await codeStep(page, 'thura@point.test');
    await expect(page.getByTestId('user-menu-name')).toHaveText('ကိုသူရ');

    // Switch to English: saved through PATCH /v1/me.
    await page.getByRole('button', { name: 'English' }).first().click();
    await expect(page.getByTestId('user-menu-name')).toHaveText('Ko Thura');
    await page.getByTestId('user-menu-sign-out').click();
    await expect(page).toHaveURL(/\/login\?reason=1$/);

    // A second code for Ko Thura within 60 seconds would answer 429: a fresh limiter.
    await restartApi(playwright);
    await codeStep(page, 'thura@point.test');
    await expect(page.getByTestId('user-menu-name')).toHaveText('Ko Thura');
    await page.getByTestId('user-menu-sign-out').click();

    // The same browser — cookie point_locale=en — and Ko Zaw, whose ui_language is NULL: Myanmar.
    await codeStep(page, 'zaw@point.test');
    await expect(page.getByTestId('user-menu-name')).toHaveText('ကိုဇော်');
    const locale = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'point_locale',
    );
    expect(locale?.value).toBe('my');
  });
});
