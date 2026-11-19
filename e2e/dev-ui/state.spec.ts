import { expect, test } from './fixtures.js';

// Tasks 11.19 and 11.20 (offline) · AD-L10N-06 · AD-NAV-06 · AD-STATE-05 — runs in my-320, en-320,
// my-1280 and en-1280.

test.describe('add-shared-ui-components · ui-foundation · Switching the language changes every string without a page load', () => {
  test('Scenario: Switching to English keeps the page state', async ({
    page,
    lang,
    openCatalogue,
  }) => {
    // From the project's language to the other one (the scenario's way is my → en).
    const other = lang === 'my' ? 'en' : 'my';
    await openCatalogue();
    const field = page.getByTestId('demo-MoneyInput-price').getByRole('textbox');
    await field.fill('8000');
    await expect(field).toHaveValue('8,000');

    const documents: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documents.push(request.url());
    });
    await page
      .getByTestId('demo-LanguageSwitch-switch')
      .locator('button[aria-pressed="false"]')
      .click();

    await expect(page.locator('html')).toHaveAttribute('lang', other);
    await expect(
      page.getByTestId('demo-LanguageSwitch-switch').locator('button[aria-pressed="true"]'),
    ).toHaveCount(1);
    const cookie = (await page.context().cookies()).find(({ name }) => name === 'point_locale');
    expect(cookie?.value).toBe(other);
    await expect(field).toHaveValue('8,000');
    expect(documents).toEqual([]);

    // Scenario: The choice survives a reload where no session exists.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', other);
  });
});

test.describe('add-shared-ui-components · ui-foundation · A drawer is addressable and guards unsaved edits', () => {
  test('Scenario: Address and Back button', async ({ page, openCatalogue }) => {
    await openCatalogue();
    await page.getByTestId('demo-Drawer-booking').locator('button:not([aria-pressed])').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('drawer')).toBe('booking:demo-1');
    expect(page.url()).toContain('drawer=booking:demo-1');

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/dev/ui');
    expect(new URL(page.url()).searchParams.get('drawer')).toBeNull();
    await expect(page.getByTestId('demo-Drawer-booking')).toBeVisible();
  });
});

test.describe('add-shared-ui-components · ui-foundation · An offline banner stays while the connection is down', () => {
  test('Scenario: Offline banner text', async ({ page, context, lang, openCatalogue }) => {
    await openCatalogue();
    const demo = page.getByTestId('demo-OfflineBanner-offline');
    const field = demo.getByRole('textbox');
    await field.fill('8000');

    await context.setOffline(true);
    const banner = demo.locator('[data-slot="offline-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('position', 'sticky');
    await expect(banner).toHaveCSS('top', '0px');
    await expect(banner.getByRole('link')).toHaveAttribute('href', /.+/);
    if (lang === 'en') {
      await expect(banner).toContainText(
        "No connection. Money actions can't be saved right now. Write the service on paper and add it later with Late entry.",
      );
    }
    await expect(field).toHaveValue('8,000');

    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
    await expect(field).toHaveValue('8,000');
  });
});
