import type { Page } from '@playwright/test';

// Measurements read in the page. Each function passed to evaluate() runs in the browser, so it holds
// its own helpers.

/** The page's horizontal scroll width; equals the viewport width when nothing overflows. */
export function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

/**
 * Elements that hide their overflow while their content is wider than their box — text cut off
 * without a trace (AD-QA-01 · AD-L10N-04). Visually hidden screen-reader text (a 1 × 1 px absolute
 * box, such as the names of icon-only navigation — AD-VIS-11 v1.8) is hidden on purpose.
 */
export function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const where = (el: Element) => {
      const owner = el.closest('[data-testid]') ?? el.closest('section[id]');
      const label = owner instanceof HTMLElement ? (owner.dataset.testid ?? owner.id) : 'page';
      const slot = el.getAttribute('data-slot');
      return `${label} ${el.tagName.toLowerCase()}${slot === null ? '' : `[${slot}]`} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    };
    return [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.overflowX !== 'hidden' && style.overflowX !== 'clip') return false;
        const box = el.getBoundingClientRect();
        if (style.position === 'absolute' && box.width <= 1 && box.height <= 1) return false;
        return el.scrollWidth > el.clientWidth + 1;
      })
      .map(where);
  });
}

/** The computed value of a CSS variable in the colour format of the element's own colours. */
export function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}
