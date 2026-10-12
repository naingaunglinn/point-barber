import { expect, test } from './fixtures.js';

// Spec "Motion is short and honours reduced motion" (AD-VIS-09) — the drawer at 1280 px, in my-1280
// and en-1280. The reduced-motion half is reduced-motion.spec.ts (project reduced-motion).

test.describe('add-shared-ui-components · ui-foundation · Motion is short and honours reduced motion', () => {
  test('Scenario: Drawer motion', async ({ page, openCatalogue }) => {
    test.skip(page.viewportSize()?.width !== 1280, 'at 1280 px');
    await openCatalogue();
    await page.getByTestId('demo-Drawer-booking').locator('button:not([aria-pressed])').click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    // The slide is a keyframe animation (tw-animate-css), so its length is the animation's.
    const motion = await panel.evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(motion.name).not.toBe('none');
    expect(motion.duration).toBe('0.2s');
  });
});
