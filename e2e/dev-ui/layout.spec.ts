import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { clippedElements, scrollWidth } from './measure.js';

// Task 11.17 · AD-VIS-10 · AD-VIS-07 · AD-QA-01 — the breakpoints and gutters set their own widths and
// run in my-1280 / en-1280; the layout-changing components run at 360 and 768 px (my-360, en-360,
// my-768, en-768).

const TABLET = 768;

/** Whether the element takes up space on the page. */
function shown(locator: Locator): Promise<boolean> {
  return locator.evaluate(
    (el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0,
  );
}

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('not rendered');
  return box.width;
}

function viewportWidth(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error('no viewport');
  return size.width;
}

test.describe('add-shared-ui-components · ui-foundation · The app shell changes its layout at 768 px and 1024 px', () => {
  test('Scenario: Layout at the breakpoints', async ({ page, openCatalogue }) => {
    test.skip(viewportWidth(page) !== 1280, 'sets its own widths; once per language');
    await openCatalogue();
    const shell = page.getByTestId('demo-AppShell-persona');
    const rail = shell.locator('[data-slot="rail"]');
    const subNav = shell.locator('[data-slot="sub-nav"]');
    const bottomNav = shell.locator('[data-slot="bottom-nav-area"]');

    await page.setViewportSize({ width: 767, height: 900 });
    expect(await shown(bottomNav)).toBe(true);
    expect(await shown(rail)).toBe(false);

    for (const tablet of [768, 1023]) {
      await page.setViewportSize({ width: tablet, height: 900 });
      expect(await shown(rail), `rail at ${tablet}`).toBe(true);
      expect(await shown(bottomNav), `bottom navigation at ${tablet}`).toBe(false);
      expect(await shown(subNav), `sub-navigation at ${tablet}`).toBe(false);
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    expect(await width(rail)).toBe(64);
    expect(await width(subNav)).toBe(240);
    const first = await shell.locator('[data-slot="top-bar"]').evaluate((bar) => {
      const children = [...bar.children].filter((child) => child.getClientRects().length > 0);
      children.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      return children[0]?.querySelector('[data-slot="branch-switcher"]') !== null;
    });
    expect(first, 'the branch switcher leads the top bar').toBe(true);
  });

  test('Scenario: Icon-only navigation keeps its names', async ({ page, lang, openCatalogue }) => {
    test.skip(lang !== 'my', 'Myanmar names');
    const phone = viewportWidth(page) === 320;
    test.skip(!phone && viewportWidth(page) !== 1280, 'at 320 px, and at 1024 px from my-1280');
    await openCatalogue();
    if (!phone) await page.setViewportSize({ width: 1024, height: 900 });
    const shell = page.getByTestId('demo-AppShell-persona');
    const area = shell.locator(phone ? '[data-slot="bottom-nav-area"]' : '[data-slot="rail"]');
    const items = area.locator('a, button');
    expect(await items.count()).toBeGreaterThan(0);

    // No visible label: every text node of an item sits in a 1 × 1 px screen-reader box.
    const visibleText = await items.evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const shownText: string[] = [];
        for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
          const parent = text.parentElement;
          const box = parent?.getBoundingClientRect();
          const hidden = box !== undefined && box.width <= 1 && box.height <= 1;
          const value = text.textContent?.trim() ?? '';
          if (!hidden && value !== '' && !/^[\d၀-၉]+$/.test(value)) shownText.push(value);
        }
        return shownText;
      }),
    );
    expect(visibleText).toEqual([]);

    // Each item is named in Myanmar (the count badge may follow the name).
    for (const item of await items.all()) {
      const name = await item.evaluate((el) => el.textContent?.trim() ?? '');
      expect(name).toMatch(/[က-႟]/);
      await expect(item).toHaveAccessibleName(name);
    }

    if (!phone) {
      // A rail item shows its name as a tooltip on focus.
      const item = items.first();
      const name = (await item.evaluate((el) => el.textContent?.trim() ?? '')).replace(
        /\s*[\d၀-၉]+$/,
        '',
      );
      await item.focus();
      await expect(page.getByRole('tooltip')).toContainText(name);
    }
    expect(await scrollWidth(page)).toBe(viewportWidth(page));
  });

  test('Scenario: Gutter and padding', async ({ page, openCatalogue }) => {
    test.skip(viewportWidth(page) !== 1280, 'sets its own widths; once per language');
    await openCatalogue();
    const content = page.getByTestId('demo-AppShell-persona').locator('main[data-slot="content"]');
    const padding = () => content.evaluate((el) => getComputedStyle(el).paddingInlineStart);

    // The page gutter below 768 px …
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await padding()).toBe('16px');
    // … and the content padding from 1024 px (AD-VIS-07).
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await padding()).toBe('24px');
  });
});

test.describe('add-shared-ui-components · ui-foundation · A shared component is done only when it passes the component checklist', () => {
  test('Scenario: Layout-changing components at 360 and 768 px', async ({
    page,
    openCatalogue,
  }) => {
    const viewport = viewportWidth(page);
    test.skip(viewport !== 360 && viewport !== TABLET, 'the 360 and 768 px projects');
    const phone = viewport < TABLET;
    await openCatalogue();

    // DataTable: cards on a phone, a table from 768 px.
    for (const id of ['sales', 'nine-columns']) {
      const demo = page.getByTestId(`demo-DataTable-${id}`);
      await expect(demo.locator('[data-slot="card-list"]'), id).toHaveCount(phone ? 1 : 0);
      await expect(demo.locator('table'), id).toHaveCount(phone ? 0 : 1);
    }
    // CardList: cards at both widths.
    expect(
      await page.getByTestId('demo-CardList-sales').locator('[data-slot="card"]').count(),
    ).toBeGreaterThan(0);

    // Stepper: "Step n of m" with a bar on a phone, the row of steps from 768 px.
    const stepper = page.getByTestId('demo-Stepper-checkout');
    expect(await shown(stepper.locator('[data-slot="stepper-compact"]'))).toBe(phone);
    expect(await shown(stepper.locator('[data-slot="stepper-row"]'))).toBe(!phone);

    // BarChart: a ranked list on a phone, the chart from 768 px; LineChart: the chart at both.
    const bars = page.getByTestId('demo-BarChart-revenue');
    await expect(bars.locator('[data-slot="ranked-list"]')).toHaveCount(phone ? 1 : 0);
    await expect(bars.locator('[data-slot="chart-frame"]')).toHaveCount(phone ? 0 : 1);
    for (const id of ['three', 'six']) {
      await expect(
        page.getByTestId(`demo-LineChart-${id}`).locator('[data-slot="chart-frame"]'),
      ).toHaveCount(1);
    }

    // AppShell: bottom navigation on a phone, the rail from 768 px.
    const shell = page.getByTestId('demo-AppShell-persona');
    expect(await shown(shell.locator('[data-slot="bottom-nav-area"]'))).toBe(phone);
    expect(await shown(shell.locator('[data-slot="rail"]'))).toBe(!phone);

    expect(await scrollWidth(page)).toBe(viewport);
    expect(await clippedElements(page)).toEqual([]);

    // Drawer: the whole screen on a phone, a 560 px right panel over the content from 768 px.
    const drawer = page.getByTestId('demo-Drawer-booking');
    await drawer.locator('button:not([aria-pressed])').click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    await expect.poll(() => width(panel)).toBe(phone ? viewport : 560);
    const box = await panel.boundingBox();
    expect(box === null ? null : Math.round(box.x + box.width)).toBe(viewport);
  });
});
