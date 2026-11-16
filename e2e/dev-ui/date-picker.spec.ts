import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

// The DateInput picker on a small screen (AD-QA-01 · AD-A11Y-05): seven 44 px day columns fit 320 px, and
// a popup taller than the room on either side of its field stays inside the screen and scrolls. The test
// places the field itself: against the left or the right edge of the screen; high, in the middle or low.
// The clock is in November 2026, whose grid has six weeks: the tallest month.

const MIN_TARGET = 44;
/** The popup's border is a 1 px ring drawn outside its box. */
const RING = 1;
const SIX_WEEKS = { now: '2026-11-05T10:00:00+06:30' };
const FIELD_WIDTH = 120;
const FIELD_HEIGHT = 48;

type Edge = 'left' | 'right';

const demo = (page: Page) => page.getByTestId('demo-DateInput-visit-date');
const picker = (page: Page) => page.locator('[data-slot="date-picker"]');

/** Fixes the field `top` px below the top of the screen, against one edge of it. */
async function placeField(page: Page, edge: Edge, top: number): Promise<void> {
  await demo(page)
    .locator('[data-slot="date-input"]')
    .evaluate(
      (el: HTMLElement, at) => {
        Object.assign(el.style, {
          position: 'fixed',
          zIndex: '1',
          top: `${at.top}px`,
          left: at.edge === 'left' ? '0' : 'auto',
          right: at.edge === 'right' ? '0' : 'auto',
          width: `${at.width}px`,
        });
      },
      { edge, top, width: FIELD_WIDTH },
    );
}

/**
 * The boxes of the open picker, read after its opening animation (`zoom-in-95` scales it, so a box read
 * mid-animation is a fraction of a pixel short: see `rows()` in menu-choice.spec.ts) and after the frames
 * in which it takes on the height bound to the room it has.
 */
function measurePicker(page: Page) {
  return picker(page).evaluate(async (el) => {
    const opening = document.getAnimations().filter((animation) => {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      const finite = Number.isFinite(animation.effect?.getComputedTiming().endTime);
      return finite && target !== null && target.contains(el);
    });
    await Promise.all(opening.map((animation) => animation.finished.catch(() => undefined)));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const box = el.getBoundingClientRect();
    const days = [...el.querySelectorAll('button[data-day]')].map((day) =>
      day.getBoundingClientRect(),
    );
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      weeks: new Set(days.map((day) => day.top)).size,
      lastColumn: Math.max(...days.map((day) => day.right)),
      narrowestDay: Math.min(...days.map((day) => day.width)),
      lowestDay: Math.min(...days.map((day) => day.height)),
    };
  });
}

/** Scrolls the popup to its end: is the month's last day then inside the popup and on the screen? */
function lastDayReachable(page: Page): Promise<boolean> {
  return picker(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    const box = el.getBoundingClientRect();
    const days = el.querySelectorAll('button[data-day]');
    const last = days[days.length - 1]?.getBoundingClientRect();
    return last !== undefined && last.bottom <= box.bottom && last.bottom <= window.innerHeight;
  });
}

test.describe('add-shared-ui-components · ui-foundation · A shared component is done only when it passes the component checklist', () => {
  for (const size of [
    { width: 320, height: 800 },
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 360, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    test(`The date picker stays inside a ${size.width} × ${size.height} screen`, async ({
      page,
      openCatalogue,
    }) => {
      const project = size.width === 1280 ? 1280 : 320;
      test.skip(page.viewportSize()?.width !== project, 'sets its own size; once per language');
      await page.setViewportSize(size);
      await openCatalogue(SIX_WEEKS);
      const trigger = demo(page).locator('[data-slot="popover-trigger"]');
      const middle = Math.round(size.height * 0.45);
      for (const edge of ['left', 'right'] as const) {
        for (const top of [8, middle, size.height - FIELD_HEIGHT - 8]) {
          await placeField(page, edge, top);
          await trigger.click();
          await expect(picker(page)).toBeVisible();
          const where = `${edge} edge, field at ${top} px`;
          const box = await measurePicker(page);
          expect(box.weeks, where).toBe(6);
          expect(box.lastColumn, where).toBeLessThanOrEqual(size.width);
          expect(box.lastColumn, where).toBeLessThanOrEqual(box.right);
          expect(box.left - RING, where).toBeGreaterThanOrEqual(0);
          expect(box.right + RING, where).toBeLessThanOrEqual(size.width);
          expect(box.top - RING, where).toBeGreaterThanOrEqual(0);
          expect(box.bottom + RING, where).toBeLessThanOrEqual(size.height);
          expect(box.narrowestDay, where).toBeGreaterThanOrEqual(MIN_TARGET);
          expect(box.lowestDay, where).toBeGreaterThanOrEqual(MIN_TARGET);
          expect(await lastDayReachable(page), where).toBe(true);
          await page.keyboard.press('Escape');
          await expect(picker(page)).toBeHidden();
        }
      }
    });
  }
});
