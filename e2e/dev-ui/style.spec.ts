import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { tokenColour } from './measure.js';

// Tasks 11.20 (text style) and 11.21 (focus outline, input border) · AD-VIS-03 · AD-A11Y-02 ·
// AD-VIS-04 · FE-VIS-01a · AD-VIS-06 · AD-VIS-08 — runs in my-320, en-320, my-1280 and en-1280.

/** Moves the keyboard focus onto the element with Tab, so `:focus-visible` applies as for a user. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
}

/** The outline once the focus transition has ended (`transition-colors` also animates its colour). */
function outlineOf(target: Locator) {
  return target.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle, colour: style.outlineColor };
  });
}

/** The colour of the border drawn around a field: the input's own, or the group that draws it. */
function borderOf(input: Locator): Promise<string> {
  return input.evaluate((el) => {
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.borderTopWidth !== '0px' && style.borderTopStyle !== 'none')
        return style.borderTopColor;
      if (node.matches('[data-testid]')) break;
    }
    return 'no border';
  });
}

const FIELD_DEMOS = [
  'demo-MoneyInput-price',
  'demo-PhoneInput-phone',
  'demo-DateInput-visit-date',
  'demo-BilingualInput-service-name',
];

test.describe('add-shared-ui-components · ui-foundation · The focus outline and the input border reach 3 : 1 in both trees', () => {
  for (const theme of ['staff', 'site'] as const) {
    test(`Scenario: Focus outline in the ${theme} tree`, async ({ page, openCatalogue }) => {
      await openCatalogue({ theme });
      // Staff: --foreground until the admin palette arrives; site: its --ring, black.
      const expected = await tokenColour(page, theme === 'staff' ? '--foreground' : '--ring');
      if (theme === 'site') expect(expected).toBe('rgb(0, 0, 0)');

      const button = page
        .getByTestId('demo-Button-variants')
        .locator('[data-variant="primary"]')
        .first();
      const money = page.getByTestId('demo-MoneyInput-price').getByRole('textbox');
      for (const control of [button, money]) {
        await tabTo(page, control);
        expect(await outlineOf(control)).toEqual({
          width: '2px',
          style: 'solid',
          colour: expected,
        });
      }
    });

    test(`Scenario: Input border in the ${theme} tree`, async ({ page, openCatalogue }) => {
      await openCatalogue({ theme });
      const expected = await tokenColour(
        page,
        theme === 'staff' ? '--muted-foreground' : '--input',
      );
      if (theme === 'site') expect(expected).toBe('rgb(112, 112, 112)');
      for (const demo of FIELD_DEMOS) {
        for (const input of await page.getByTestId(demo).locator('input').all()) {
          expect(await borderOf(input), demo).toBe(expected);
        }
      }
    });
  }
});

test.describe('add-shared-ui-components · ui-foundation · Myanmar text is never upper-cased, italicised or letter-spaced', () => {
  test('Scenario: Computed style of every demo in Myanmar', async ({
    page,
    lang,
    openCatalogue,
  }) => {
    test.skip(lang !== 'my', 'lang=my');
    await openCatalogue();
    const styled = await page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.body.querySelectorAll('*')) {
        const hasText = [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
        );
        if (!hasText) continue;
        const style = getComputedStyle(el);
        if (
          style.textTransform !== 'none' ||
          style.fontStyle !== 'normal' ||
          style.letterSpacing !== 'normal'
        ) {
          found.push(
            `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${style.textTransform} ${style.fontStyle} ${style.letterSpacing}`,
          );
        }
      }
      return found;
    });
    expect(styled).toEqual([]);
  });
});

test.describe('add-shared-ui-components · ui-foundation · Spacing and radius come from fixed tokens', () => {
  test('Scenario: Radius', async ({ page, openCatalogue }) => {
    await openCatalogue();
    const radius = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.width = 'var(--radius)';
      document.body.append(probe);
      const width = getComputedStyle(probe).width;
      probe.remove();
      return width;
    });
    expect(radius).toBe('8px');
    const card = page.getByTestId('demo-CardList-sales').locator('[data-slot="card"]').first();
    await expect(card).toHaveCSS('border-radius', '6px'); // md = 8 − 2
    const button = page
      .getByTestId('demo-Button-variants')
      .locator('[data-variant="primary"]')
      .first();
    await expect(button).toHaveCSS('border-radius', '6px');
  });
});

test.describe('add-shared-ui-components · ui-foundation · The type scale has Latin and Myanmar line-heights', () => {
  test('Scenario: Inputs do not trigger iOS zoom', async ({ page, openCatalogue }) => {
    test.skip(page.viewportSize()?.width !== 320, 'at 320 px');
    await openCatalogue();
    const small = await page.evaluate(() =>
      // Fields that take typing (a checkbox or a file picker opens no keyboard).
      [
        ...document.querySelectorAll(
          'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="file"], [type="range"], [type="color"]), textarea, select',
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 1)
        .map((el) => ({ el, size: getComputedStyle(el).fontSize }))
        .filter(({ size }) => Number(size.replace('px', '')) < 16)
        .map(
          ({ el, size }) => `${el.closest('[data-testid]')?.getAttribute('data-testid')} ${size}`,
        ),
    );
    expect(small).toEqual([]);
  });
});
