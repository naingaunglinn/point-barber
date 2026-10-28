import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { APP_ORIGIN } from './hosts.js';
import { signInAs } from './helpers/sign-in.js';
import { restartApi, withServiceEnv } from './helpers/stack.js';

// add-staging-deploy task 5.3 — platform-runtime spec "Web app errors reach Sentry with a DSN read at
// run time" (ADR-007 decision 3 · design D10). The same image runs twice: recreated with a DSN on the
// fake ingest origin and APP_ENV=staging, then as .env has it (SENTRY_DSN_WEB empty). Playwright
// intercepts the ingest origin, so nothing leaves the runner. Code requests in this file: 2;
// verifies: 2 (≤ 8 each — e2e/README.md).

const INGEST = 'https://o0.ingest.sentry.io';
const DSN = `https://public@o0.ingest.sentry.io/2`;

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

/** The `event` items of an envelope: newline-delimited JSON, item header then payload. */
function eventsOf(envelope: string): Record<string, unknown>[] {
  const lines = envelope.split('\n').filter((line) => line.length > 0);
  const events: Record<string, unknown>[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    if ((JSON.parse(lines[i] ?? '{}') as { type?: string }).type === 'event') {
      events.push(JSON.parse(lines[i + 1] ?? '{}') as Record<string, unknown>);
    }
  }
  return events;
}

/** An error no code catches, thrown in the page after the current task. */
const throwUncaught = (page: Page) =>
  page.evaluate(() => {
    setTimeout(() => {
      throw new Error('e2e uncaught error');
    }, 0);
  });

test.describe('add-staging-deploy · platform-runtime · Web app errors reach Sentry with a DSN read at run time', () => {
  test('Scenario: An uncaught browser error on the staff host', async ({
    playwright,
    browser,
    app,
  }) => {
    const release = ((await (await app.get('/api/v1/system/status')).json()) as { version: string })
      .version;
    await withServiceEnv(
      playwright,
      'web',
      { SENTRY_DSN_WEB: DSN, APP_ENV: 'staging' },
      `${APP_ORIGIN}/login`,
      async () => {
        const context = await signInAs(browser, app, 'aung@point.test');
        const envelopes: string[] = [];
        await context.route(`${INGEST}/**`, async (route) => {
          envelopes.push(route.request().postData() ?? '');
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        const page = await context.newPage();
        await page.goto('/?branch=B3');
        await expect(page.getByTestId('landing-name')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-error-reporting', 'ready');
        await throwUncaught(page);
        await expect.poll(() => envelopes.length).toBe(1);
        await page.waitForTimeout(1000);
        expect(envelopes).toHaveLength(1);
        const events = eventsOf(envelopes[0] ?? '');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          release,
          environment: 'staging',
          request: { url: `${APP_ORIGIN}/` },
        });
        await context.close();
      },
    );
  });

  // Ko Min, not Ko Aung: a second code for one address within 60 seconds would answer 429.
  test('Scenario: The same image without a DSN', async ({ browser, app }) => {
    const context = await signInAs(browser, app, 'min@point.test');
    const sentry: string[] = [];
    context.on('request', (request) => {
      if (/sentry/i.test(new URL(request.url()).host)) sentry.push(request.url());
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('landing-name')).toBeVisible();
    await throwUncaught(page);
    await page.waitForTimeout(2000);
    expect(sentry).toStrictEqual([]);
    expect(await page.content()).not.toContain('ingest.sentry.io');
    await expect(page.locator('html')).not.toHaveAttribute('data-error-reporting', 'ready');
    await context.close();
  });
});
