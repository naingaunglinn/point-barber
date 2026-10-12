import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

// Task 11.20 · D-PLT-15 · AD-FORM-15 · CG-TIME-04 — project foreign-zone only: a browser in
// America/Los_Angeles whose clock says 01/Jan/2020. "Today" comes from the catalogue clock alone.

/** The day the DateInput picker of the demo marks as today, as `YYYY-MM-DD`. */
async function pickerToday(page: Page): Promise<string | null> {
  await page
    .getByTestId('demo-DateInput-visit-date')
    .locator('[data-slot="popover-trigger"]')
    .click();
  const picker = page.locator('[data-slot="date-picker"]');
  await expect(picker).toBeVisible();
  return picker.locator('[data-today="true"] [data-day]').getAttribute('data-day');
}

test.describe('add-shared-ui-components · ui-foundation · "Today" and "now" come from the supplied clock, not from the device', () => {
  test('Scenario: A phone with a wrong date', async ({ page, openCatalogue }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openCatalogue();
    expect(await page.evaluate(() => new Date().getUTCFullYear())).toBe(2020);

    expect(await pickerToday(page)).toBe('2026-10-05');
    await page.keyboard.press('Escape');

    // The first preset of the bookings filter is "Today"; this bar writes its choice to the address.
    const filter = page.getByTestId('demo-FilterBar-bookings');
    await filter.locator('[data-slot="date-presets"] button').first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe('2026-10-05');
    expect(new URL(page.url()).searchParams.get('to')).toBe('2026-10-05');

    // The server rendered the page in its own zone; the browser's zone changed no text (no hydration
    // mismatch).
    expect(errors).toEqual([]);
  });
});

test.describe('add-shared-ui-components · ui-foundation · Dates are typed, picked and shown as `DD/MMM/YYYY` on the Myanmar calendar date', () => {
  test('Scenario: The picker opens on the Myanmar date', async ({ page, openCatalogue }) => {
    // 18:00 UTC on 04/Oct = 00:30 MMT on 05/Oct (11:00 on 04/Oct in Los Angeles).
    await openCatalogue({ now: '2026-10-04T18:00:00Z' });
    expect(await pickerToday(page)).toBe('2026-10-05');
  });
});
