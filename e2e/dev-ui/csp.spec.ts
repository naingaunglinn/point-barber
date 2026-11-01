import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { type PolicyViolation, recordPolicyViolations } from '../fixtures.js';
import { expect, settle, test } from './fixtures.js';

// add-staging-deploy · platform-runtime "The screens run under the policy without a violation" for
// the `/dev/ui` catalogue (ADR-009 · CG-SEC-12 · design D8), agreed with Dev 2 on 01/Nov/2026 — runs
// in my-320, en-320, my-1280 and en-1280. The catalogue build runs under `next start` alone, without
// Caddy, so the policy is read from the Caddyfile (its one source) and added here to every `/dev/ui`
// document. Violations are recorded by the e2e suite's own recorder (`recordPolicyViolations`,
// e2e/fixtures.ts): its `policyViolations` fixture belongs to the stack suite's `test`, whose context
// teardown fails on any violation — which the negative check below must cause.

const CADDYFILE = fileURLToPath(new URL('../../infra/caddy/Caddyfile', import.meta.url));

/**
 * The `Content-Security-Policy` value of the Caddyfile's `(common)` snippet, as Caddy sends it with
 * an empty CADDY_CSP_CONNECT (.env.example; no ingest origin, so connect-src is 'self' only — the
 * strictest form of the policy). Throws when the line is missing or another placeholder is left.
 */
function caddyPolicy(): string {
  const caddyfile = readFileSync(CADDYFILE, 'utf8');
  const common = /^\(common\) \{\n([\s\S]*?)^\}/m.exec(caddyfile)?.[1] ?? '';
  const lines = [...common.matchAll(/^\s*Content-Security-Policy\s+"([^"]+)"\s*$/gm)];
  if (lines.length !== 1)
    throw new Error(
      `${CADDYFILE}: expected one Content-Security-Policy line in (common), found ${lines.length}`,
    );
  const policy = lines[0]![1]!.replaceAll('{$CADDY_CSP_CONNECT}', '');
  if (policy.includes('{$')) throw new Error(`${CADDYFILE}: a placeholder is left in ${policy}`);
  return policy;
}

/** Serves every `/dev/ui` document with the policy header, as Caddy does in front of the web app. */
async function sendPolicy(page: Page, policy: string): Promise<void> {
  await page.route(
    (url) => url.pathname === '/dev/ui',
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      return route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': policy },
      });
    },
  );
}

/** Clicks `trigger`, waits for what it opens and closes it with Escape. */
async function openAndClose(page: Page, trigger: Locator, opened: Locator): Promise<void> {
  await trigger.click();
  await expect(opened).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opened).toHaveCount(0);
}

/**
 * Every section scrolled into view, every opener of "Dialogs and overlays", and the pickers,
 * filters, charts, toasts, scanner and language switch the other catalogue specs open. Not the
 * QrScanner camera demo: CI's browser has no camera, so getUserMedia fails before the ZXing
 * WebAssembly would load — that path (WebAssembly needs 'wasm-unsafe-eval' in script-src) is not
 * covered here.
 */
async function walkDemos(page: Page): Promise<void> {
  const sections = page.locator('main > section[id]');
  await expect(sections).toHaveCount(14);
  for (const section of await sections.all()) await section.scrollIntoViewIfNeeded();
  await settle(page);

  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  // ReasonDialog ×5, ConfirmDialog, Drawer, Sheet ×2 and Dialog; the Drawer's width buttons
  // (aria-pressed) open nothing.
  const openers = page.locator(
    '#dialogs-and-overlays [data-testid^="demo-"] button:not([aria-pressed])',
  );
  await expect(openers).toHaveCount(10);
  for (const opener of await openers.all()) await openAndClose(page, opener, dialog);

  const popover = page.locator('[data-slot="popover-content"]');
  await openAndClose(
    page,
    page.getByTestId('demo-DateInput-visit-date').locator('[data-slot="popover-trigger"]'),
    page.locator('[data-slot="date-picker"]'),
  );
  await openAndClose(
    page,
    page.getByTestId('demo-NotificationBell-list').locator('[data-slot="popover-trigger"]'),
    popover,
  );
  await openAndClose(page, page.getByTestId('demo-QrScanner-mock').getByRole('button'), dialog);

  const bar = page.getByTestId('demo-FilterBar-bookings');
  await bar.locator('[data-slot="date-presets"] button').last().click();
  await expect(bar.locator('[data-slot="form-field"]')).toHaveCount(2);

  const chart = page.getByTestId('demo-LineChart-six');
  await chart.locator('[data-slot="chart-frame"] button').first().click();
  await expect(chart.locator('table, [data-slot="chart-cards"]')).not.toHaveCount(0);

  await page.getByTestId('demo-Toaster-success').getByRole('button').click();
  await expect(page.locator('[data-sonner-toast]')).not.toHaveCount(0);

  const lang = await page.locator('html').getAttribute('lang');
  await page
    .getByTestId('demo-LanguageSwitch-switch')
    .locator('button[aria-pressed="false"]')
    .click();
  await expect(page.locator('html')).not.toHaveAttribute('lang', lang ?? '');
  await settle(page);
}

test.describe('add-staging-deploy · platform-runtime · The screens run under the policy without a violation', () => {
  test('Scenario: Component catalogue and site placeholder — every section and its overlays', async ({
    page,
    openCatalogue,
  }) => {
    // One catalogue load and about twenty overlays; a load alone can take 20–30 s (smoke.spec.ts).
    test.slow();
    const policy = caddyPolicy();
    const violations: PolicyViolation[] = [];
    await recordPolicyViolations(page.context(), violations);
    const served: (string | undefined)[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'document')
        served.push(response.headers()['content-security-policy']);
    });
    await sendPolicy(page, policy);

    await openCatalogue({ theme: 'staff' });
    await walkDemos(page);

    expect(served.length).toBeGreaterThan(0);
    expect(served.every((header) => header === policy)).toBe(true);
    expect(violations, 'securitypolicyviolation events').toStrictEqual([]);
  });

  test('Scenario: Component catalogue and site placeholder — a violation is recorded', async ({
    page,
    lang,
    openCatalogue,
  }) => {
    test.skip(lang !== 'en' || page.viewportSize()?.width !== 1280, 'once, in en-1280');
    const violations: PolicyViolation[] = [];
    await recordPolicyViolations(page.context(), violations);
    await sendPolicy(page, caddyPolicy());
    await openCatalogue({ theme: 'staff' });

    // A script from an origin the policy does not list; `.invalid` never resolves (RFC 6761), so no
    // request leaves the machine even if the policy were missing.
    const probe = 'https://csp-probe.invalid/probe.js';
    await page.evaluate((src) => {
      const script = document.createElement('script');
      script.src = src;
      document.head.append(script);
    }, probe);
    await expect
      .poll(() => violations)
      .toContainEqual(
        expect.objectContaining({
          directive: expect.stringMatching(/^script-src/),
          blocked: probe,
        }),
      );
  });
});
