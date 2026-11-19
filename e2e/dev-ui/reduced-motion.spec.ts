import { expect, test } from './fixtures.js';

// Spec "Motion is short and honours reduced motion" (AD-VIS-09 · AD-A11Y-06) — project reduced-motion:
// `prefers-reduced-motion: reduce` at 1280 px.

test.describe('add-shared-ui-components · ui-foundation · Motion is short and honours reduced motion', () => {
  test('Scenario: Reduced motion', async ({ page, openCatalogue }) => {
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await openCatalogue();
    await page.getByTestId('demo-Drawer-booking').locator('button:not([aria-pressed])').click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    // Read at once: no slide is running and the panel already stands at its place.
    const motion = await panel.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        duration: style.animationDuration,
        transition: style.transitionDuration,
        transform: style.transform,
        moving: el.getAnimations().filter((animation) => animation.playState === 'running').length,
      };
    });
    expect(motion).toEqual({ duration: '0s', transition: '0s', transform: 'none', moving: 0 });
  });
});
