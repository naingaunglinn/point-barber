import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { BookingStatus } from '@point/shared';

import { ClockProvider } from '../../providers/clock';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { FilterBar, filterFromSearch } from './FilterBar';
import type { FilterValue } from './filter-address';

// ui-foundation "Filters live in the address" (AD-LIST-01 · AD-LIST-05 · AD-FMT-11 · design D10).
const DEFAULT_NOW = '2026-10-05T10:42:00+06:30';
const RECEIPT = 'Receipt no.';

function Bookings({ now = DEFAULT_NOW }: { now?: string }) {
  // The page reads the address once, as a screen does on load.
  const [value, setValue] = useState<FilterValue>(() =>
    filterFromSearch(new URLSearchParams(window.location.search)),
  );
  return (
    <ClockProvider now={now}>
      <FormatProvider locale="en" profile="app">
        <FilterBar
          value={value}
          onChange={setValue}
          search={{ placeholder: RECEIPT }}
          statuses={{
            table: 'bookings',
            codes: [BookingStatus.BOOKED, BookingStatus.STARTED, BookingStatus.COMPLETED],
          }}
        />
      </FormatProvider>
    </ClockProvider>
  );
}

const preset = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const range = () => {
  const search = new URLSearchParams(window.location.search);
  return `from=${search.get('from')}&to=${search.get('to')}`;
};

beforeEach(() => window.history.replaceState(null, '', '/dev/ui?lang=en'));

describe('FilterBar', () => {
  it('has a search box that says what it searches, mirrored as q', () => {
    renderIntl(<Bookings />);
    const box = screen.getByRole('searchbox', { name: RECEIPT });
    expect(box.getAttribute('placeholder')).toBe(RECEIPT);
    fireEvent.change(box, { target: { value: 'B3-2026' } });
    expect(window.location.search).toBe('?lang=en&q=B3-2026');
  });

  it('Scenario: Date presets on Monday 05/Oct/2026', () => {
    renderIntl(<Bookings />);
    const seen = ['Today', 'Yesterday', 'This week', 'Last 7 days', 'This month', 'Last month'].map(
      (name) => {
        preset(name);
        return range();
      },
    );
    expect(seen).toEqual([
      'from=2026-10-05&to=2026-10-05',
      'from=2026-10-04&to=2026-10-04',
      'from=2026-10-05&to=2026-10-11',
      'from=2026-09-29&to=2026-10-05',
      'from=2026-10-01&to=2026-10-31',
      'from=2026-09-01&to=2026-09-30',
    ]);
    expect(new URLSearchParams(window.location.search).get('lang')).toBe('en');
  });

  it('Scenario: "Today" changes at midnight Myanmar Time — 17:29Z is 05/Oct, 17:30Z is 06/Oct', () => {
    const before = renderIntl(<Bookings now="2026-10-05T17:29:00Z" />);
    preset('Today');
    expect(range()).toBe('from=2026-10-05&to=2026-10-05');
    before.unmount();
    window.history.replaceState(null, '', '/dev/ui?lang=en');
    renderIntl(<Bookings now="2026-10-05T17:30:00Z" />);
    preset('Today');
    expect(range()).toBe('from=2026-10-06&to=2026-10-06');
  });

  it('Scenario: Status chips — status=1&status=2, two removable chips after a reload, Clear all removes both', () => {
    const first = renderIntl(<Bookings />);
    preset('Booked');
    preset('Started');
    expect(window.location.search).toBe('?lang=en&status=1&status=2');
    first.unmount();
    renderIntl(<Bookings />); // the reload
    const chips = [...document.querySelectorAll('[data-slot="active-filters"] [data-filter]')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Remove Booked', 'Remove Started']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(window.location.search).toBe('?lang=en');
    expect(document.querySelector('[data-slot="active-filters"]')).toBeNull();
  });

  it('removes one filter with its chip', () => {
    renderIntl(<Bookings />);
    preset('Today');
    preset('Booked');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Today' }));
    expect(window.location.search).toBe('?lang=en&status=1');
  });

  it('the custom range: the end date cannot be before the start date', () => {
    renderIntl(<Bookings />);
    preset('Custom');
    const [from, to] = screen.getAllByRole('textbox', { name: 'Custom' }) as HTMLInputElement[];
    fireEvent.change(from as HTMLInputElement, { target: { value: '05/10/2026' } });
    fireEvent.blur(from as HTMLInputElement);
    fireEvent.change(to as HTMLInputElement, { target: { value: '04/10/2026' } });
    fireEvent.blur(to as HTMLInputElement);
    expect(screen.getByText('Enter a valid date, for example 05/Oct/2026.')).toBeDefined();
    expect(range()).toBe('from=2026-10-05&to=null');
    fireEvent.change(to as HTMLInputElement, { target: { value: '07/10/2026' } });
    fireEvent.blur(to as HTMLInputElement);
    expect(range()).toBe('from=2026-10-05&to=2026-10-07');
  });
});
