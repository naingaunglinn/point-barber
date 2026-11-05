import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

// Task 11.32 — ui-foundation "Rare and destructive actions sit behind one kebab menu" (AD-LAY-04 ·
// AD-LAY-05 · AD-LIST-04 · AD-A11Y-02 · AD-A11Y-05 · AD-VIS-07) and "Up to seven options are a radio
// group, eight or more a searchable combobox" (AD-FORM-14 · AD-A11Y-02 · AD-A11Y-05), on the demos of
// ActionMenu (section Shell) and ChoiceGroup (section Inputs). Runs in my-320, en-320, my-1280, en-1280;
// the keyboard scenarios at 1280 px (AD-A11Y-02 is the desktop keyboard rule). The combobox's popover is
// portaled to the end of the page, so its search field and options are looked up on the page.

const MIN_TARGET = 44;
const MIN_GAP = 8;

const kebab = (page: Page) => page.getByTestId('demo-ActionMenu-kebab');
const seven = (page: Page) => page.getByTestId('demo-ChoiceGroup-seven');
const eight = (page: Page) => page.getByTestId('demo-ChoiceGroup-eight');
const log = (demo: Locator) => demo.locator('[data-slot="handler-log"]');
const searchName = (lang: string) => (lang === 'en' ? 'Search' : 'ရှာမည်');
/** The combobox's popover (other demos of the page have search fields of their own). */
const popover = (page: Page) => page.locator('[data-slot="choice-popover"]');
const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** The boxes of the given elements, top to bottom: heights and the gaps between neighbours. */
async function rows(locator: Locator): Promise<{ heights: number[]; gaps: number[] }> {
  const boxes = await locator.evaluateAll((elements) =>
    elements.map((el) => {
      const { top, bottom } = el.getBoundingClientRect();
      return { top, bottom };
    }),
  );
  return {
    heights: boxes.map((box) => box.bottom - box.top),
    gaps: boxes.slice(1).map((box, index) => box.top - (boxes[index]?.bottom ?? 0)),
  };
}

/** The element's text colour and a token's value, both as sRGB pixels (the spellings differ). */
function colours(locator: Locator, token: string): Promise<{ text: string; token: string }> {
  return locator.evaluate((el, name) => {
    const rgb = (colour: string) => {
      const context = Object.assign(document.createElement('canvas'), {
        width: 1,
        height: 1,
      }).getContext('2d') as CanvasRenderingContext2D;
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(',');
    };
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return { text: rgb(getComputedStyle(el).color), token: rgb(value) };
  }, token);
}

test.describe('add-shared-ui-components · ui-foundation · Rare and destructive actions sit behind one kebab menu', () => {
  test('Scenario: The trigger is named "More" in both languages', async ({
    page,
    lang,
    openCatalogue,
  }) => {
    await openCatalogue();
    const trigger = kebab(page).getByRole('button', { name: lang === 'en' ? 'More' : 'နောက်ထပ်' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveText('');
    await expect(trigger.locator('svg')).toHaveCount(1);
  });

  test('Scenario: Kebab with a destructive action', async ({ page, lang, openCatalogue }) => {
    await openCatalogue();
    await kebab(page).getByTestId('kebab-more').click();
    const items = page.getByRole('menu').getByRole('menuitem');
    await expect(items).toHaveCount(3);
    if (lang === 'en') await expect(items).toHaveText(['Print', 'Export', 'Cancel booking']);
    const { heights, gaps } = await rows(items);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_GAP);
    const cancel = page.getByTestId('kebab-cancel-booking');
    const { text, token } = await colours(cancel, '--destructive');
    expect(text).toBe(token);

    await cancel.click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    if (lang === 'en') await expect(dialog.getByRole('heading')).toHaveText('Cancel booking');
    await expect(dialog.getByRole('radio')).toHaveCount(4);
    await expect(log(kebab(page))).toHaveText('');
  });

  test('Scenario: Keyboard', async ({ page, lang, openCatalogue }) => {
    test.skip(!desktop(page), 'keyboard at 1280 px');
    await openCatalogue();
    const trigger = kebab(page).getByTestId('kebab-more');
    const items = page.getByRole('menu').getByRole('menuitem');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    if (lang === 'en') await expect(log(kebab(page))).toHaveText('Handler call: Export pressed');
    else await expect(log(kebab(page))).not.toHaveText('');
  });
});

test.describe('add-shared-ui-components · ui-foundation · Up to seven options are a radio group, eight or more a searchable combobox', () => {
  test('Scenario: Seven options and eight options', async ({ page, lang, openCatalogue }) => {
    await openCatalogue();
    await expect(seven(page).getByRole('radiogroup').getByRole('radio')).toHaveCount(7);
    await expect(seven(page).getByRole('listbox')).toHaveCount(0);
    await expect(seven(page).getByRole('combobox')).toHaveCount(0);

    await expect(eight(page).getByRole('radio')).toHaveCount(0);
    // Collapsed: one trigger named by the label, without text; no popover, so no search field and no
    // option yet.
    const trigger = eight(page).getByRole('combobox');
    await expect(trigger).toHaveCount(1);
    if (lang === 'en') await expect(trigger).toHaveAccessibleName('Reason');
    await expect(trigger).toHaveText('');
    await expect(popover(page)).toHaveCount(0);
    await expect(eight(page).getByRole('option')).toHaveCount(0);

    await trigger.click();
    const list = popover(page).getByRole('listbox');
    await expect(list.getByRole('option')).toHaveCount(8);
    const { heights, gaps } = await rows(list.getByRole('option'));
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_GAP);
    const search = popover(page).getByRole('combobox', { name: searchName(lang) });
    await expect(search).toHaveAttribute('placeholder', searchName(lang));
    await expect(search).toBeFocused();
    await search.fill('Other');
    await expect(list.getByRole('option')).toHaveText(['Other']);

    await list.getByRole('option', { name: 'Other' }).click();
    await expect(popover(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Other');
    await expect(trigger).toBeFocused();
    await expect(log(eight(page))).toContainText('onChange("reason-4")');
  });

  test('Scenario: Keyboard in the combobox', async ({ page, lang, openCatalogue }) => {
    test.skip(!desktop(page), 'keyboard at 1280 px');
    await openCatalogue();
    const trigger = eight(page).getByRole('combobox');
    const search = popover(page).getByRole('combobox', { name: searchName(lang) });
    const options = popover(page).getByRole('listbox').getByRole('option');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('');
    await expect(log(eight(page))).toHaveText('');

    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    if (lang === 'en')
      await expect(options.nth(0)).toHaveAccessibleName('Customer wants to change');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(1)).toHaveAccessibleName('Barber မအား');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Barber မအား');
    await expect(trigger).toBeFocused();
    await expect(log(eight(page))).toContainText('onChange("reason-2")');
  });

  test('Scenario: Keyboard in the radio group', async ({ page, lang, openCatalogue }) => {
    test.skip(!desktop(page), 'keyboard at 1280 px');
    await openCatalogue();
    const radios = seven(page).getByRole('radio');
    // Reach the group with Tab from the control before it (nothing is chosen yet).
    await radios.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(radios.first()).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(radios.first()).toBeFocused();
    await expect(radios.first()).toHaveAttribute('aria-checked', 'false');
    if (lang === 'en')
      await expect(radios.first()).toHaveAccessibleName('Customer wants to change');

    // Held for 50 ms like a real key press: Radix moves the focus in a timeout after keydown and checks
    // the radio only while the arrow key is still down, which a 0 ms press can miss.
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect(radios.nth(2)).toBeFocused();
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(radios.nth(2)).toHaveAccessibleName('Customer မလာ');
    await expect(log(seven(page))).toContainText('onChange("reason-3")');

    await page.keyboard.press('Tab');
    const inGroup = await seven(page)
      .getByRole('radiogroup')
      .evaluate((group) => group.contains(document.activeElement));
    expect(inGroup).toBe(false);
  });

  test('Scenario: The label text is part of the target', async ({ page, openCatalogue }) => {
    await openCatalogue();
    const labels = seven(page).getByRole('radiogroup').locator('label');
    await expect(labels).toHaveCount(7);
    const { heights, gaps } = await rows(labels);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MIN_GAP);
    await seven(page).getByText('Other', { exact: true }).click();
    await expect(seven(page).getByRole('radio', { name: 'Other' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Scenario: Test ids reach the element with the role', async ({ page, openCatalogue }) => {
    await openCatalogue();
    // The two choice demos use the same ids; the 7-option one is the radio form.
    const option = seven(page).getByTestId('choice-reason-2');
    await expect(option).toHaveAttribute('role', 'radio');
    await option.check();
    await expect(option).toBeChecked();
    await expect(seven(page).getByTestId('choice-reason-1')).not.toBeChecked();
    await expect(log(seven(page))).toContainText('onChange("reason-2")');
  });
});
