import { expect, test } from './fixtures.js';
import { mailpit } from './helpers/mailpit.js';
import { APP_HEADERS } from './helpers/sign-in.js';
import { restartApi, sql } from './helpers/stack.js';

// add-foundation-auth-access task 8.6 — five wrong codes lock code sign-in for 20 minutes, and the
// resend countdown (AD-LOGIN-02 · P1-RULE-03 · API-LIM-02). Code requests in this file: 2; verifies:
// 5 (≤ 8 each — e2e/README.md).

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

// The 20-minute lock outlives this file: the next spec that signs Ko Min in must not meet it.
test.afterAll(() => {
  sql(
    "UPDATE users SET failed_login_count = 0, login_locked_until = NULL WHERE email = 'min@point.test';",
  );
});

test('five wrong codes for Ko Min lock the screen with the lock end; resend waits 60 seconds', async ({
  page,
  app,
}) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('min@point.test');
  const since = new Date();
  await page.getByTestId('login-send-code').click();
  await expect(page.getByTestId('login-code')).toBeVisible();
  const code = await mailpit.readCode('min@point.test', since);
  const wrong = code === '11112222' ? '22223333' : '11112222';

  // The Resend button is disabled during the countdown …
  await expect(page.getByTestId('login-resend')).toBeDisabled();
  // … and a resend before 60 seconds through the API answers 429.
  const early = await app.post('/api/v1/auth/otp/request', {
    headers: APP_HEADERS,
    data: { email: 'min@point.test' },
  });
  expect(early.status()).toBe(429);
  expect(await early.json()).toMatchObject({ code: 'rate_limited' });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await page.getByTestId('login-code').fill(wrong);
    await page.getByTestId('login-submit').click();
    if (attempt < 5) {
      await expect(page.getByTestId('login-code')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId('login-code')).toBeEnabled();
    }
  }
  // The lock message names the lock end as h:mm AM/PM (Myanmar, the system default, or English).
  await expect(page.locator('form')).toContainText(/(Try again at|မှာ ပြန်စမ်းပါ)/);
  await expect(page.locator('form')).toContainText(/[0-9]{1,2}:[0-9]{2} (AM|PM)/);
  await expect(page.getByTestId('login-code')).toBeDisabled();
  await expect(page.getByTestId('login-submit')).toBeDisabled();
});
