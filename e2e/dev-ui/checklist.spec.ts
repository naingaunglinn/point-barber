import { expect, test } from './fixtures.js';

// AD-A11Y-02 · AD-L10N-04 · owner answer G2 (13/Oct/2026, point-sdd review §0.16) — the keyboard walk
// runs in my-320, en-320, my-1280 and en-1280; the long Myanmar label in my-320.

/** What has the focus inside the ReasonDialog, with its outline after the colour transition. */
function focusStop(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const el = document.activeElement as HTMLElement;
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    const dialog = el.closest('[role="alertdialog"]');
    // Colours compared as sRGB pixels: the computed spellings (oklab, lab, rgb) differ.
    const rgb = (colour: string) => {
      const context = Object.assign(document.createElement('canvas'), {
        width: 1,
        height: 1,
      }).getContext('2d') as CanvasRenderingContext2D;
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(',');
    };
    const style = getComputedStyle(el);
    const foreground = getComputedStyle(document.body).getPropertyValue('--foreground').trim();
    const outline = `${style.outlineStyle} ${style.outlineWidth} ${rgb(style.outlineColor)}`;
    const expected = `solid 2px ${rgb(foreground)}`;
    if (dialog === null) return { stop: 'outside', outlined: outline === expected };
    // The plain buttons of the dialog in order: Close (header), Keep, the confirm button (footer).
    const buttons = [...dialog.querySelectorAll('button:not([role])')];
    const stop =
      el.getAttribute('role') === 'radio'
        ? 'reason'
        : el.tagName === 'TEXTAREA'
          ? 'note'
          : (['close', 'keep', 'confirm'][buttons.indexOf(el)] ?? 'other');
    return { stop, outlined: outline === expected };
  });
}

test.describe('add-shared-ui-components · ui-foundation · A shared component is done only when it passes the component checklist', () => {
  test('Scenario: Keyboard walk through a dialog', async ({ page, openCatalogue }) => {
    await openCatalogue();
    const trigger = page.getByTestId('demo-ReasonDialog-master').getByRole('button').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();

    const stops = [await focusStop(page)];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      stops.push(await focusStop(page));
    }
    // Opens on Close; Close → reason → note → Keep → confirm → Close, never leaving the dialog.
    expect(stops.map(({ stop }) => stop)).toEqual([
      'close',
      'reason',
      'note',
      'keep',
      'confirm',
      'close',
    ]);
    expect(stops.every(({ outlined }) => outlined)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Scenario: Long Myanmar label', async ({ page, lang, openCatalogue }) => {
    test.skip(lang !== 'my' || page.viewportSize()?.width !== 320, 'lang=my at 320 px');
    await openCatalogue();
    const label = 'ဒီ booking ကို ဖျက်ပြီး ဖောက်သည်ဆီ SMS နဲ့ အကြောင်းကြားမည့် ခလုတ်';
    const button = page.getByTestId('demo-ReasonDialog-master').getByRole('button').first();
    const badge = page.locator('#badges-and-chips [data-slot="status-badge"]').first();
    for (const [element, box] of [
      [button, 160],
      [badge, 120],
    ] as const) {
      // The label goes into the element's last text span, in a box narrower than the label.
      const measured = await element.evaluate(
        (el, [text, width]) => {
          const spans = [...el.querySelectorAll('span')].filter(
            (span) => span.children.length === 0 && span.textContent?.trim() !== '',
          );
          const span = spans.at(-1) ?? el;
          (el.parentElement as HTMLElement).style.width = `${width}px`;
          span.textContent = text;
          // The label's line boxes: a range over its text has a client rect per line (several on one
          // line when Myanmar and Latin runs mix); a new line starts more than half a line lower.
          const range = document.createRange();
          range.selectNodeContents(span);
          const rects = [...range.getClientRects()].sort((a, b) => a.top - b.top);
          const half = Math.min(...rects.map((rect) => rect.height)) / 2;
          const lines = rects.filter(
            (rect, i) => i === 0 || rect.top - rects[i - 1]!.top > half,
          ).length;
          return {
            lines,
            ellipsis: [el, span].some(
              (node) => getComputedStyle(node as Element).textOverflow === 'ellipsis',
            ),
            overflow: el.scrollWidth > el.clientWidth + 1,
            // The element stays inside its box instead of growing past it.
            wider: el.getBoundingClientRect().width > width + 1,
          };
        },
        [label, box] as const,
      );
      expect(measured.lines).toBeGreaterThanOrEqual(2);
      expect(measured.ellipsis).toBe(false);
      expect(measured.overflow).toBe(false);
      expect(measured.wider).toBe(false);
    }
  });
});
