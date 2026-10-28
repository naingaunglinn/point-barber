import { expect, test } from './fixtures.js';
import { SITE_ORIGIN } from './hosts.js';
import { mailpit } from './helpers/mailpit.js';
import { restartApi } from './helpers/stack.js';

// add-staging-deploy task 5.2 — platform-runtime spec "The screens run under the policy without a
// violation" (ADR-009 · CG-SEC-12 · design D8): the `page` fixture records every
// securitypolicyviolation event and fails the test on any (fixtures.ts). Code requests in this file:
// 1; verifies: 1 (≤ 8 each — e2e/README.md).

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

test.describe('add-staging-deploy · platform-runtime · The screens run under the policy without a violation', () => {
  test('Scenario: Sign-in and start page', async ({ page, policyViolations }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('aung@point.test');
    const since = new Date();
    await page.getByTestId('login-send-code').click();
    await expect(page.getByTestId('login-code')).toBeVisible();
    await page.getByTestId('login-code').fill(await mailpit.readCode('aung@point.test', since));
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('landing-name')).toBeVisible();
    expect(policyViolations).toStrictEqual([]);
  });

  // The catalogue answers only in an image built with `build:catalogue`; the e2e image is the
  // production build, so /dev/ui is its not-found page here — it still runs under the policy.
  test('Scenario: Component catalogue and site placeholder', async ({ page, policyViolations }) => {
    await page.goto('/dev/ui');
    await page.goto(`${SITE_ORIGIN}/`);
    await expect(page.getByTestId('site-placeholder')).toBeVisible();
    expect(policyViolations).toStrictEqual([]);
  });
});
