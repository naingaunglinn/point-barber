import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import type { Action } from '../types';
import { PageHeader } from './PageHeader';

// ui-foundation "A page header has one primary action and at most two visible secondary actions"
// (AD-LAY-05 · AD-LAY-04 · design D10). Labels are the caller's (translated).
const action = (label: string, extra: Partial<Action> = {}): Action => ({
  label,
  onPress: vi.fn(),
  ...extra,
});
const NEW_BOOKING = 'New booking';
const [EXPORT, PRINT, IMPORT, SETTINGS] = ['Export', 'Print', 'Import', 'Settings'];

const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
    button: 0,
    pointerType: 'mouse',
  });

describe('PageHeader', () => {
  it('Scenario: Page header actions — one filled button, two secondary buttons, a menu with the other two', () => {
    renderIntl(
      <PageHeader
        title="Bookings"
        subtitle="Point 3.0 · 05/Oct/2026"
        primary={action(NEW_BOOKING)}
        secondary={[action(EXPORT), action(PRINT), action(IMPORT), action(SETTINGS)]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeDefined();
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.filter((b) => b.dataset.variant === 'primary').map((b) => b.textContent),
    ).toEqual([NEW_BOOKING]);
    expect(
      buttons.filter((b) => b.dataset.variant === 'secondary').map((b) => b.textContent),
    ).toEqual([EXPORT, PRINT]);
    expect(buttons.at(-1)?.textContent).toBe(NEW_BOOKING);
    openMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      IMPORT,
      SETTINGS,
    ]);
  });

  it('Scenario: Exactly two secondary actions — both visible, no menu', () => {
    renderIntl(
      <PageHeader
        title="Bookings"
        primary={action(NEW_BOOKING)}
        secondary={[action(EXPORT), action(PRINT)]}
      />,
    );
    expect(screen.getByRole('button', { name: EXPORT })).toBeDefined();
    expect(screen.getByRole('button', { name: PRINT })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('a destructive secondary action goes into the menu, never next to the primary', () => {
    const remove = action('Delete branch', { destructive: true });
    renderIntl(
      <PageHeader
        title="Point 3.0"
        primary={action('Save')}
        secondary={[action(EXPORT), remove]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete branch' })).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete branch' }));
    expect(remove.onPress).toHaveBeenCalledTimes(1);
  });

  it('an action that is not allowed is not shown; the filter bar sits under the header', () => {
    renderIntl(
      <PageHeader
        title="Sales"
        primary={action(NEW_BOOKING, { allowed: false })}
        secondary={[action(EXPORT, { allowed: false })]}
        filterBar={<div data-testid="filters" />}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('filters')).toBeDefined();
  });
});
