import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { moneyToWire } from '@point/shared';

import { HAIR_COLOUR_GRID, SERVICES } from '../../catalogue/fixtures';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { mockViewport } from '../../test/viewport';
import { OptionPicker, type OptionGroups, type SoldCell } from './OptionPicker';

// ui-foundation "OptionPicker offers only sold combinations and shows the price before Add" (AD-POS-05 ·
// FE-BK-06 · D-SVC-05 · FE-IMPL-03 · design D10), on the Hair colour grid at B3 (spec-fixtures.md §8).
const name = (en: string) => ({ mm: en, en });
const GROUPS: OptionGroups = [
  {
    id: 'colour',
    name: name('Colour'),
    values: HAIR_COLOUR_GRID.colours.map((c) => ({ id: c, name: name(c) })),
  },
  {
    id: 'length',
    name: name('Length'),
    values: HAIR_COLOUR_GRID.lengths.map((l) => ({ id: l, name: name(l) })),
  },
];
const CELLS: readonly SoldCell[] = HAIR_COLOUR_GRID.cells.flatMap((c) =>
  c.price === null || c.minutes === null
    ? []
    : [{ valueIds: [c.colour, c.length], price_amount: c.price, duration_minutes: c.minutes }],
);
const SERVICE = { mm: SERVICES.hairColour.name_mm, en: SERVICES.hairColour.name_en };

function picker(locale: 'my' | 'en', profile: 'app' | 'site', onAdd = vi.fn()) {
  return renderIntl(
    <FormatProvider locale={locale} profile={profile}>
      <OptionPicker
        open
        onOpenChange={() => {}}
        serviceName={SERVICE}
        groups={GROUPS}
        cells={CELLS}
        onAdd={onAdd}
      />
    </FormatProvider>,
    { locale },
  );
}

const choose = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

afterEach(() => vi.unstubAllGlobals());

describe('OptionPicker', () => {
  it('Scenario: Only sold combinations — Brown offers Short and Medium only', () => {
    mockViewport(1280);
    picker('en', 'app');
    choose('Brown');
    const lengths = [...document.querySelectorAll('fieldset')][1]?.querySelectorAll('button');
    expect([...(lengths ?? [])].map((b) => b.textContent)).toEqual(['Short', 'Medium']);
  });

  it.each([
    ['en', 'app', '25,000 Ks', '1 h 30 min'],
    ['my', 'app', '25,000 ကျပ်', '1 နာရီ 30 မိနစ်'],
    ['my', 'site', '25,000 Ks', '1 နာရီ 30 မိနစ်'],
  ] as const)(
    'Scenario: Price and duration before Add — %s / %s',
    (locale, profile, price, duration) => {
      mockViewport(1280);
      const onAdd = vi.fn();
      picker(locale, profile, onAdd);
      choose('Black');
      choose('Short');
      const shown = document.querySelector('[data-slot="option-price"]')?.textContent;
      expect(shown).toBe(`${price}${duration}`);
      fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Add' : 'ထည့်မည်' }));
      const [cell] = onAdd.mock.calls[0] as [SoldCell];
      expect([cell.valueIds, moneyToWire(cell.price_amount), cell.duration_minutes]).toEqual([
        ['Black', 'Short'],
        25000,
        90,
      ]);
    },
  );

  it('opens as a bottom sheet below 768 px', () => {
    mockViewport(320);
    picker('en', 'app');
    expect(screen.getByRole('dialog').getAttribute('data-side')).toBe('bottom');
  });

  it('Add stays disabled until a sold combination is chosen', () => {
    mockViewport(1280);
    picker('en', 'app');
    choose('Brown');
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
  });
});
