import { expect, test } from './fixtures.js';
import { scrollWidth } from './measure.js';

// AD-CHART-01 · AD-LIST-02 · owner answers G3 / G4 (13/Oct/2026, point-sdd review §0.16) — at 320 px
// (my-320, en-320).

test.describe('add-shared-ui-components · ui-foundation · Charts are simple, labelled and have a table view', () => {
  test('Scenario: Table view on a phone', async ({ page, openCatalogue }) => {
    test.skip(page.viewportSize()?.width !== 320, 'measured at 320 px');
    await openCatalogue();
    const demo = page.getByTestId('demo-LineChart-six');
    // The line chart keeps its chart on a phone; its toggle shows the values.
    await demo.locator('[data-slot="chart-frame"] button').first().click();

    await expect(demo.locator('table')).toHaveCount(0);
    const cards = demo.locator('[data-slot="chart-cards"] > li');
    await expect(cards).toHaveCount(7);
    for (const card of await cards.all()) {
      await expect(card.locator('dt')).toHaveCount(6);
      for (const value of await card.locator('dd').allTextContents())
        expect(value.trim()).toMatch(/^\d{1,3}(,\d{3})*$/);
    }
    expect(await scrollWidth(page)).toBe(320);
  });
});
