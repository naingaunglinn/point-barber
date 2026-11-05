import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

// Task 11.22 · AD-A11Y-01 · AD-IMPL-05 — runs in my-320, en-320, my-1280 and en-1280, each in the staff
// and the site tree.

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The rules that failed, each with the elements it names. */
async function violations(page: Page): Promise<string[]> {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  return found.map(
    ({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(' ')).join(' | ')}`,
  );
}

test.describe('add-shared-ui-components · ui-foundation · Accessibility is checked statically and on the catalogue', () => {
  for (const theme of ['staff', 'site'] as const) {
    test(`Scenario: Accessibility check on the catalogue — theme=${theme}`, async ({
      page,
      openCatalogue,
    }) => {
      await openCatalogue({ theme });
      expect(await violations(page)).toEqual([]);
    });
  }

  test('Scenario: Accessibility check on the catalogue — an input without its label fails', async ({
    page,
    openCatalogue,
  }) => {
    await openCatalogue();
    // The Name field of the FormField demo is named only by its <label> (no placeholder, title or
    // aria-label), so removing the label leaves it without a name.
    const removed = await page
      .getByTestId('demo-FormField-form')
      .locator('input')
      .first()
      .evaluate((input: HTMLInputElement) => {
        const names = [
          input.placeholder,
          input.title,
          input.getAttribute('aria-label'),
          input.getAttribute('aria-labelledby'),
        ];
        if (names.some((name) => name !== null && name !== '')) return 0;
        const labels = [...(input.labels ?? [])];
        for (const label of labels) label.remove();
        return labels.length;
      });
    expect(removed).toBeGreaterThan(0);
    const found = await violations(page);
    expect(found.map((line) => line.split(':')[0])).toContain('label');
  });
});
