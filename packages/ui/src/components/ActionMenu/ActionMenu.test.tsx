import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

// ui-foundation "Rare and destructive actions sit behind one kebab menu" (AD-LAY-04 · AD-LAY-05 ·
// AD-LIST-04 · AD-A11Y-02 · AD-A11Y-04 · AD-A11Y-05 · AD-VIS-07 · design D10). Labels are the caller's
// (translated); the trigger's name is the language file's.
const [PRINT, EXPORT, CANCEL_BOOKING, DELETE_BRANCH] = [
  'Print',
  'Export',
  'Cancel booking',
  'Delete branch',
];
const item = (label: string, extra: Partial<ActionMenuItem> = {}): ActionMenuItem => ({
  label,
  onPress: vi.fn(),
  ...extra,
});

const trigger = (name = 'More') => screen.getByRole('button', { name });
const openWithPointer = (name?: string) =>
  fireEvent.pointerDown(trigger(name), { button: 0, pointerType: 'mouse' });
const items = () => screen.getAllByRole('menuitem');

describe('ActionMenu', () => {
  it('Scenario: The trigger is named "More" in both languages — ⋮ only, a menu button', () => {
    const { unmount } = renderIntl(<ActionMenu actions={[item(PRINT)]} />);
    const en = trigger();
    expect(en.getAttribute('aria-haspopup')).toBe('menu');
    expect(en.textContent).toBe('');
    expect(en.querySelector('svg')).not.toBeNull();
    unmount();
    renderIntl(<ActionMenu actions={[item(PRINT)]} />, { locale: 'my' });
    expect(trigger('နောက်ထပ်').getAttribute('aria-haspopup')).toBe('menu');
  });

  it('Scenario: Kebab with a destructive action — the order given, the destructive style, 44 px items 8 px apart', () => {
    const cancel = item(CANCEL_BOOKING, { destructive: true });
    renderIntl(<ActionMenu actions={[item(PRINT), item(EXPORT), cancel]} />);
    openWithPointer();
    expect(items().map((entry) => entry.textContent)).toEqual([PRINT, EXPORT, CANCEL_BOOKING]);
    const [print, , destructive] = items();
    expect(destructive?.dataset.variant).toBe('destructive');
    expect(print?.dataset.variant).toBe('default');
    // Height and gap are classes here; the catalogue spec measures them in a browser.
    for (const entry of items()) expect(entry.className).toContain('min-h-11');
    expect(screen.getByRole('menu').className).toContain('gap-2');
    fireEvent.click(destructive as HTMLElement);
    expect(cancel.onPress).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Scenario: Keyboard — Enter opens on the first item, ArrowDown moves, Esc returns to the trigger', async () => {
    const exportAction = item(EXPORT);
    renderIntl(<ActionMenu actions={[item(PRINT), exportAction]} />);
    const button = trigger();
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    await waitFor(() => expect(document.activeElement?.textContent).toBe(PRINT));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.textContent).toBe(EXPORT));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.textContent).toBe(PRINT));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.textContent).toBe(EXPORT));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(exportAction.onPress).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Scenario: Hidden actions and an empty menu — allowed: false is not shown; none allowed, no trigger', () => {
    const { unmount } = renderIntl(
      <ActionMenu actions={[item(PRINT), item(DELETE_BRANCH, { allowed: false })]} />,
    );
    openWithPointer();
    expect(items().map((entry) => entry.textContent)).toEqual([PRINT]);
    unmount();
    const { container } = renderIntl(
      <ActionMenu actions={[item(DELETE_BRANCH, { allowed: false, destructive: true })]} />,
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Scenario: Test ids reach the trigger and the item', () => {
    const incomplete = item(CANCEL_BOOKING, { destructive: true, testId: 'visit-incomplete' });
    renderIntl(<ActionMenu actions={[incomplete]} data-testid="visit-more" />);
    const more = screen.getByTestId('visit-more');
    expect(more).toBe(trigger());
    expect(screen.queryByTestId('visit-incomplete')).toBeNull();
    fireEvent.pointerDown(more, { button: 0, pointerType: 'mouse' });
    const entry = screen.getByTestId('visit-incomplete');
    expect(entry.getAttribute('role')).toBe('menuitem');
    fireEvent.click(entry);
    expect(incomplete.onPress).toHaveBeenCalledOnce();
  });
});
