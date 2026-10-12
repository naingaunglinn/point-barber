import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { scrollWidth } from './measure.js';

// Task 11.16 · AD-A11Y-05 · AD-VIS-07 — at 320 px (my-320, en-320) and in the zoom project (640 px at
// device scale factor 2 = 1280 px at 200 %).

const MIN_TARGET = 44;
const MIN_GAP = 8;

interface Findings {
  readonly small: readonly string[];
  readonly close: readonly string[];
}

/**
 * Every visible button, link, input, checkbox, radio and chip of the page with its hit area: its own
 * box, grown by an absolutely placed ::before / ::after (the usual way to enlarge a hit area), and for
 * a checkbox, radio or switch the label that toggles it. Reports areas under 44 × 44 px and pairs of
 * areas less than 8 px apart; a control inside another is not a separate target.
 */
function measureTargets(page: Page): Promise<Findings> {
  return page.evaluate(
    ({ minTarget, minGap }) => {
      const SELECTOR = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="tab"]',
        '[role="combobox"]',
        '[role="slider"]',
      ].join(', ');
      type Box = { left: number; top: number; right: number; bottom: number };
      const union = (a: Box, b: Box): Box => ({
        left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right),
        bottom: Math.max(a.bottom, b.bottom),
      });
      const px = (value: string) => (value.endsWith('px') ? Number(value.slice(0, -2)) : null);
      const grown = (el: Element, box: Box): Box => {
        let area = box;
        for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(el, pseudo);
          if (style.content === 'none' || style.position !== 'absolute') continue;
          const top = px(style.top);
          const right = px(style.right);
          const bottom = px(style.bottom);
          const left = px(style.left);
          if (top === null || right === null || bottom === null || left === null) continue;
          // Offsets from the element's edges: a negative inset reaches outside the element.
          area = union(area, {
            left: box.left + left,
            top: box.top + top,
            right: box.right - right,
            bottom: box.bottom - bottom,
          });
        }
        return area;
      };
      const toggles = new Set(['checkbox', 'radio', 'switch']);
      const labelOf = (el: Element) =>
        el.closest('label') ??
        (el.id === '' ? null : document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      const shown = (el: Element) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          box.width > 1 &&
          box.height > 1 &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          el.closest('[aria-hidden="true"], [inert]') === null
        );
      };
      const describe = (el: Element) => {
        const owner = el.closest('[data-testid]') ?? el.closest('section[id], header, nav');
        const where =
          owner instanceof HTMLElement
            ? (owner.dataset.testid ?? (owner.id || owner.tagName))
            : 'page';
        const kind = el.getAttribute('role') ?? el.getAttribute('data-slot') ?? el.tagName;
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
        return `${where} ${kind.toLowerCase()} "${name}"`;
      };

      const targets = [...document.querySelectorAll(SELECTOR)].filter(shown).map((el) => {
        const own = el.getBoundingClientRect();
        let area = grown(el, own);
        const label = toggles.has(el.getAttribute('role') ?? (el as HTMLInputElement).type)
          ? labelOf(el)
          : null;
        if (label !== null) area = union(area, label.getBoundingClientRect());
        return { el, area };
      });

      const small = targets
        .filter(
          ({ area }) =>
            area.right - area.left + 0.01 < minTarget || area.bottom - area.top + 0.01 < minTarget,
        )
        .map(({ el, area }) => {
          const size = `${Math.round(area.right - area.left)} × ${Math.round(area.bottom - area.top)}`;
          return `${describe(el)} ${size}`;
        });

      const close: string[] = [];
      targets.forEach((a, index) => {
        for (const b of targets.slice(index + 1)) {
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const dx = Math.max(b.area.left - a.area.right, a.area.left - b.area.right);
          const dy = Math.max(b.area.top - a.area.bottom, a.area.top - b.area.bottom);
          const gap = Math.max(dx, dy);
          if (gap + 0.5 < minGap)
            close.push(`${describe(a.el)} ↔ ${describe(b.el)}: ${gap.toFixed(1)} px`);
        }
      });
      return { small, close };
    },
    { minTarget: MIN_TARGET, minGap: MIN_GAP },
  );
}

test.describe('add-shared-ui-components · ui-foundation · A shared component is done only when it passes the component checklist', () => {
  test('Scenario: Touch targets on a phone', async ({ page, openCatalogue }) => {
    test.skip(page.viewportSize()?.width !== 320, 'measured at 320 px');
    await openCatalogue();
    const { small, close } = await measureTargets(page);
    expect.soft(small, 'hit areas under 44 × 44 px').toEqual([]);
    expect.soft(close, 'targets closer than 8 px').toEqual([]);
  });

  test('Scenario: Zoom', async ({ page, openCatalogue }) => {
    test.skip(page.viewportSize()?.width !== 640, 'the 200 % zoom project only');
    await openCatalogue();
    expect(await scrollWidth(page)).toBe(640);
    const { small, close } = await measureTargets(page);
    expect.soft(small, 'hit areas under 44 × 44 px').toEqual([]);
    expect.soft(close, 'targets closer than 8 px').toEqual([]);
  });
});
