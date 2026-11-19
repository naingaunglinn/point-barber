import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Instant, Slot } from '@point/shared';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { TimeSlotPicker } from './TimeSlotPicker';

// ui-foundation "TimeSlotPicker shows only the start times it is given" (AD-BKG-01 · D-PLT-05 · design D10).
const slot = (start: string, end: string): Slot => ({
  starts_at: `2026-10-05T${start}:00+06:30`,
  ends_at: `2026-10-05T${end}:00+06:30`,
});
const SLOTS = [slot('10:00', '10:30'), slot('10:15', '10:45'), slot('10:45', '11:15')];
const DAY = '05/Oct/2026';

function Demo({ slots, onValue }: { slots: readonly Slot[]; onValue?: (v: Instant) => void }) {
  const [value, setValue] = useState<Instant | null>(null);
  return (
    <FormatProvider locale="en" profile="app">
      <TimeSlotPicker
        aria-label={DAY}
        slots={slots}
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    </FormatProvider>
  );
}

describe('TimeSlotPicker', () => {
  it('Scenario: Available start times only — 10:00, 10:15, 10:45 AM; 10:15 reports its instant with a check', () => {
    const onValue = vi.fn();
    renderIntl(<Demo slots={SLOTS} onValue={onValue} />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      '10:00 AM',
      '10:15 AM',
      '10:45 AM',
    ]);
    expect(screen.queryByText('10:30 AM')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '10:15 AM' }));
    expect(onValue).toHaveBeenCalledWith('2026-10-05T10:15:00+06:30');
    const chosen = screen.getByRole('radio', { name: '10:15 AM' });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(chosen.querySelector('[data-icon="check"]')).not.toBeNull();
  });

  it('Scenario: No start time left — "No times left on this day"', () => {
    renderIntl(<Demo slots={[]} />);
    expect(screen.getByText('No times left on this day')).toBeDefined();
  });
});
