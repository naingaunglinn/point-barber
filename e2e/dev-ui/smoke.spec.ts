import { expect, test } from './fixtures.js';
import { clippedElements, scrollWidth } from './measure.js';

// Task 11.15 · AD-QA-01 · AD-L10N-04 — runs in my-320, en-320, my-1280 and en-1280.

test.describe('add-shared-ui-components · ui-foundation · The catalogue shows every shared component in both languages', () => {
  test('Scenario: Both languages at both widths', async ({ page, openCatalogue }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openCatalogue();

    // Section smoke: all 14 sections render, and each component entry has a demo with content.
    const sections = await page
      .locator('main > section[id]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({ id: node.id, height: node.getBoundingClientRect().height })),
      );
    expect(sections).toHaveLength(14);
    for (const { id, height } of sections) expect(height, id).toBeGreaterThan(0);

    const entries = await page.locator('main article[id]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const demos = [...node.querySelectorAll<HTMLElement>('[data-testid^="demo-"]')];
        // A demo root holds its title and the demo itself.
        const empty = demos.filter(
          (demo) => demo.children.length < 2 || demo.getBoundingClientRect().height === 0,
        );
        return {
          id: node.id,
          demos: demos.length,
          empty: empty.map((demo) => demo.dataset.testid),
        };
      }),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const { id, demos, empty } of entries) {
      expect(demos, id).toBeGreaterThan(0);
      expect(empty, id).toEqual([]);
    }

    const width = page.viewportSize()?.width;
    expect(await scrollWidth(page)).toBe(width);
    expect(await clippedElements(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Scenario: Persona parameter', async ({ page, openCatalogue }) => {
    const gate = page.getByTestId('demo-PermissionGate-cancel-booking');
    const deleteRow = page.locator('[data-testid="can-table"] tr[data-code="booking.delete"]');
    const answers = () =>
      deleteRow
        .locator('[data-answer]')
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-answer')));

    // Ko Aung (barber) holds no booking.delete: the gate hides "Cancel booking".
    await openCatalogue({ as: 'barber' });
    await expect(gate.getByRole('button')).toHaveCount(0);
    expect(await answers()).not.toContain('true');

    // U Kyaw Zin (admin) holds it everywhere: the button is there and enabled.
    await openCatalogue({ as: 'admin' });
    await expect(gate.getByRole('button')).toHaveCount(1);
    await expect(gate.getByRole('button')).toBeEnabled();
    expect(await answers()).toContain('true');
    expect(await answers()).not.toContain('false');
  });
});
