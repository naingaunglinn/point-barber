import { expect, test } from './fixtures.js';

// AD-LIST-01 · AD-A11Y-04 · owner answer G1 (13/Oct/2026, point-sdd review §0.16) — runs in my-320,
// en-320, my-1280 and en-1280.

const LABELS = { my: ['စရက်', 'ဆုံးရက်'], en: ['From', 'To'] } as const;

test.describe('add-shared-ui-components · ui-foundation · Filters live in the address', () => {
  test('Scenario: Custom range fields are labelled', async ({ page, lang, openCatalogue }) => {
    await openCatalogue();
    const bar = page.getByTestId('demo-FilterBar-bookings');
    // Custom is the last date preset.
    await bar.locator('[data-slot="date-presets"] button').last().click();

    const fields = bar.locator('[data-slot="form-field"]');
    await expect(fields).toHaveCount(2);
    const [fromLabel, toLabel] = LABELS[lang];
    await expect(fields.nth(0).locator('label')).toHaveText(fromLabel);
    await expect(fields.nth(1).locator('label')).toHaveText(toLabel);
    const from = bar.getByRole('textbox', { name: fromLabel, exact: true });
    const to = bar.getByRole('textbox', { name: toLabel, exact: true });
    await expect(from).toBeVisible();
    await expect(to).toBeVisible();

    // The end date cannot be before the start date.
    await from.fill('05/10/2026');
    await from.blur();
    await to.fill('04/10/2026');
    await to.blur();
    await expect(bar.locator('[data-slot="field-message"]')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get('from')).toBe('2026-10-05');
    expect(new URL(page.url()).searchParams.get('to')).toBeNull();
  });
});
