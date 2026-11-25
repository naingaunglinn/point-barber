import type { Page } from '@playwright/test';
import { z } from 'zod';

import { expect, recordPolicyViolations, test } from './fixtures.js';
import { APP_ORIGIN } from './hosts.js';
import { looseObject, parseJsonText, readJson } from './helpers/json.js';
import { signInAs } from './helpers/sign-in.js';
import { gotoAfterRecreate, restartApi, withServiceEnv } from './helpers/stack.js';

// add-staging-deploy task 5.3 — platform-runtime spec "Web app errors reach Sentry with a DSN read at
// run time" (ADR-007 decision 3 · design D10). The same image runs twice: recreated with a DSN on the
// fake ingest origin and APP_ENV=staging, then as .env has it (SENTRY_DSN_WEB empty). Playwright
// intercepts the ingest origin, so nothing leaves the runner. Both contexts record the policy
// violations too: with the SDK loaded is the pilot's configuration (D8). Code requests in this file: 2;
// verifies: 2 (≤ 8 each — e2e/README.md).

const INGEST = 'https://o0.ingest.sentry.io';
const DSN = `https://public@o0.ingest.sentry.io/2`;

test.beforeAll(async ({ playwright }) => {
  await restartApi(playwright);
});

const itemHeader = z.object({ type: z.string().optional() });

/** The `event` items of an envelope: newline-delimited JSON, item header then payload. */
function eventsOf(envelope: string): Record<string, unknown>[] {
  const lines = envelope.split('\n').filter((line) => line.length > 0);
  const events: Record<string, unknown>[] = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    if (parseJsonText(itemHeader, lines[i] ?? '{}').type === 'event') {
      events.push(parseJsonText(looseObject, lines[i + 1] ?? '{}'));
    }
  }
  return events;
}

/** An error no code catches, thrown in the page after the current task. */
const throwUncaught = (page: Page, message = 'e2e uncaught error') =>
  page.evaluate((text) => {
    setTimeout(() => {
      throw new Error(text);
    }, 0);
  }, message);

test.describe('add-staging-deploy · platform-runtime · Web app errors reach Sentry with a DSN read at run time', () => {
  test('Scenario: An uncaught browser error on the staff host', async ({
    playwright,
    browser,
    app,
    policyViolations,
  }) => {
    const { version: release } = await readJson(
      z.object({ version: z.string() }),
      await app.get('/api/v1/system/status'),
    );
    await withServiceEnv(
      playwright,
      'web',
      { SENTRY_DSN_WEB: DSN, APP_ENV: 'staging' },
      `${APP_ORIGIN}/login`,
      async () => {
        const context = await signInAs(browser, app, 'aung@point.test');
        await recordPolicyViolations(context, policyViolations);
        const envelopes: string[] = [];
        await context.route(`${INGEST}/**`, async (route) => {
          envelopes.push(route.request().postData() ?? '');
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        const page = await context.newPage();
        // `/` opens Today with the query kept (add-walkin-visit-checkout task 10.1); the event's URL
        // has no query string.
        await gotoAfterRecreate(page, '/?branch=B3', page.getByTestId('today'));
        await expect(page.locator('html')).toHaveAttribute('data-error-reporting', 'ready');
        await throwUncaught(page);
        await expect.poll(() => envelopes.length).toBe(1);
        // One envelope per error, not a second copy of the first: a different error is sent next
        // and arrives as the second envelope (no fixed wait — CG-TEST-09; no page.clock, whose Date
        // stand-in breaks TZDate — e2e/dev-ui/fixtures.ts).
        await throwUncaught(page, 'e2e second uncaught error');
        await expect.poll(() => envelopes.length).toBe(2);
        expect(JSON.stringify(eventsOf(envelopes[1] ?? ''))).toContain('e2e second uncaught error');
        const events = eventsOf(envelopes[0] ?? '');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          release,
          environment: 'staging',
          request: { url: `${APP_ORIGIN}/today` },
        });
        expect(policyViolations, 'securitypolicyviolation events').toStrictEqual([]);
        await context.close();
      },
    );
  });

  // Ko Min, not Ko Aung: a second code for one address within 60 seconds would answer 429.
  test('Scenario: The same image without a DSN', async ({ browser, app, policyViolations }) => {
    const context = await signInAs(browser, app, 'min@point.test');
    await recordPolicyViolations(context, policyViolations);
    const sentry: string[] = [];
    context.on('request', (request) => {
      if (/sentry/i.test(new URL(request.url()).host)) sentry.push(request.url());
    });
    const page = await context.newPage();
    // The test above put the web container back just now.
    await gotoAfterRecreate(page, '/', page.getByTestId('today'));
    await throwUncaught(page);
    // Without a DSN the client is never set up (below: no `ready`, no ingest host in the page), so
    // nothing can be sent; no wait is needed to show it (CG-TEST-09).
    expect(sentry).toStrictEqual([]);
    expect(await page.content()).not.toContain('ingest.sentry.io');
    await expect(page.locator('html')).not.toHaveAttribute('data-error-reporting', 'ready');
    expect(policyViolations, 'securitypolicyviolation events').toStrictEqual([]);
    await context.close();
  });
});
