import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { moneyToWire } from '@point/shared';

import { BRANCHES, HAIR_COLOUR_GRID, SERVICES } from '../../catalogue/fixtures';
import { ClockProvider } from '../../providers/clock';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import type { OptionGroup } from '../OptionPicker/OptionPicker';
import { PriceGridEditor, type PriceCell, type PriceGridGroups } from './PriceGridEditor';

// ui-foundation "PriceGridEditor distinguishes not sold, zero and the inherited home price" (AD-CMP-13 ·
// D-SVC-05 · D-SVC-06 · D-SVC-08 · design D10), on spec-fixtures.md §3 and §8.
const name = (en: string) => ({ mm: en, en });
const COLOUR: OptionGroup = {
  id: 'colour',
  name: name('Colour'),
  values: HAIR_COLOUR_GRID.colours.map((c) => ({ id: c, name: name(c) })),
};
const LENGTH: OptionGroup = {
  id: 'length',
  name: name('Length'),
  values: HAIR_COLOUR_GRID.lengths.map((l) => ({ id: l, name: name(l) })),
};
const GRID_CELLS: readonly PriceCell[] = HAIR_COLOUR_GRID.cells.map((c) => ({
  valueIds: [c.colour, c.length],
  price_amount: c.price,
  duration_minutes: c.minutes,
}));
const GRID_BRANCHES = BRANCHES.map((b) => ({
  id: b.code,
  code: b.code,
  name_mm: b.name_mm,
  name_en: b.name_en,
}));

function editor(overrides: Partial<Parameters<typeof PriceGridEditor>[0]> = {}) {
  const onChange = vi.fn();
  renderIntl(
    <ClockProvider now="2026-10-05T10:42:00+06:30">
      <FormatProvider locale="en" profile="app">
        <PriceGridEditor
          mode="options"
          groups={[COLOUR, LENGTH]}
          branches={GRID_BRANCHES}
          branchId="B3"
          location="shop"
          cells={GRID_CELLS}
          defaultDurationMinutes={90}
          onChange={onChange}
          {...overrides}
        />
      </FormatProvider>
    </ClockProvider>,
  );
  return onChange;
}

const price = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement;

describe('PriceGridEditor', () => {
  it('lays out Colour as rows and Length as columns with branch and Shop / Home tabs', () => {
    editor();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Short',
      'Medium',
      'Long',
    ]);
    expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual([
      'Black',
      'Brown',
    ]);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Point 1.0',
      'Point 2.0',
      'Point 3.0',
      'Shop',
      'Home',
    ]);
    expect(price('Black Short').value).toBe('25,000');
  });

  it('Scenario: Empty and zero in the Shop grid — Brown · Long shows — "Not sold here" and is null; 0 is a price', () => {
    const onChange = editor();
    const long = price('Brown Long');
    expect(long.value).toBe('');
    expect(long.getAttribute('placeholder')).toBe('—');
    expect(long.getAttribute('title')).toBe('Not sold here');
    expect(
      document.getElementById(long.getAttribute('aria-describedby')?.split(' ')[0] ?? '')
        ?.textContent,
    ).toBe('Not sold here');
    fireEvent.change(price('Brown Short'), { target: { value: '0' } });
    const cells = onChange.mock.lastCall?.[0] as PriceCell[];
    const short = cells.find((c) => c.valueIds.join() === 'Brown,Short');
    const longCell = cells.find((c) => c.valueIds.join() === 'Brown,Long');
    expect(short?.price_amount === null ? null : moneyToWire(short!.price_amount)).toBe(0);
    expect(longCell?.price_amount).toBeNull();
  });

  it('Scenario: Home cell inherits the shop price — "Uses shop price · 7,000 Ks", reported null', () => {
    const shop: PriceCell = {
      valueIds: [],
      price_amount: SERVICES.haircut.prices.B2,
      duration_minutes: null,
    };
    editor({
      mode: 'simple',
      groups: [],
      branchId: 'B2',
      location: 'home',
      cells: [],
      shopCells: [shop],
      defaultDurationMinutes: 30,
    });
    // A grid without option groups names its one price field by the tab: Home here.
    const home = screen.getByRole('textbox', { name: 'Home' }) as HTMLInputElement;
    expect(home.value).toBe('');
    expect(home.getAttribute('placeholder')).toBe('Uses shop price · 7,000 Ks');
    expect(home.getAttribute('title')).toBeNull();
  });

  it('Scenario: Effective date — "Change prices from" shows 06/Oct/2026 with the default clock', () => {
    editor();
    expect(
      (screen.getByRole('textbox', { name: 'Change prices from' }) as HTMLInputElement).value,
    ).toBe('06/Oct/2026');
  });

  it('takes a duration in whole minutes and the service default as the placeholder', () => {
    const onChange = editor();
    const minutes = screen.getByRole('textbox', {
      name: 'Black Short min',
    }) as HTMLInputElement;
    expect(minutes.value).toBe('90');
    fireEvent.change(minutes, { target: { value: '၆၀' } });
    const cells = onChange.mock.lastCall?.[0] as PriceCell[];
    expect(cells.find((c) => c.valueIds.join() === 'Black,Short')?.duration_minutes).toBe(60);
    expect(
      (screen.getByRole('textbox', { name: 'Brown Long min' }) as HTMLInputElement).placeholder,
    ).toBe('90');
  });

  it('reports a branch, the location and copy from branch', () => {
    const onBranchChange = vi.fn();
    const onLocationChange = vi.fn();
    editor({ onBranchChange, onLocationChange, onCopyFromBranch: () => {} });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Point 1.0' }), { button: 0 });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Home' }), { button: 0 });
    expect(onBranchChange).toHaveBeenCalledWith('B1');
    expect(onLocationChange).toHaveBeenCalledWith('home');
    expect(screen.getByRole('button', { name: 'Copy from branch…' })).toBeDefined();
  });

  it('shows the cells as text in read-only mode', () => {
    editor({ readOnly: true });
    expect(document.querySelector('[data-slot="price-grid"] input')).toBeNull();
    expect(screen.getByText('25,000 Ks')).toBeDefined();
    expect(screen.getByText('—').getAttribute('title')).toBe('Not sold here');
  });

  it('Scenario: A third option group does not compile', () => {
    const two: PriceGridGroups = [COLOUR, LENGTH];
    // @ts-expect-error -- at most 2 option groups (AD-CMP-13).
    const three: PriceGridGroups = [COLOUR, LENGTH, COLOUR];
    expect([two, three]).toHaveLength(2);
  });
});
