import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BusinessDate } from '@point/shared';

import { ClockProvider } from '../../providers/clock';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { FormField } from '../FormField/FormField';
import { DateInput } from './DateInput';

// ui-foundation "Dates are typed, picked and shown as DD/MMM/YYYY on the Myanmar calendar date" and
// '"Today" and "now" come from the supplied clock' (D-PLT-05 · D-PLT-15 · AD-FORM-15 · CG-TIME-06 ·
// design D10). `pnpm --filter @point/ui test:zones` runs this file under three device time zones.
const LABEL = 'Date';
const DEFAULT_NOW = '2026-10-05T10:42:00+06:30';

function Demo({
  now = DEFAULT_NOW,
  min,
  max,
  onValue,
}: {
  now?: string;
  min?: BusinessDate;
  max?: BusinessDate;
  onValue?: (value: BusinessDate | null) => void;
}) {
  const [value, setValue] = useState<BusinessDate | null>(null);
  return (
    <ClockProvider now={now}>
      <FormatProvider locale="en" profile="app">
        <FormField label={LABEL}>
          {(control) => (
            <DateInput
              {...control}
              value={value}
              min={min}
              max={max}
              onChange={(next) => {
                setValue(next);
                onValue?.(next);
              }}
            />
          )}
        </FormField>
      </FormatProvider>
    </ClockProvider>
  );
}

const field = () => screen.getByRole('textbox', { name: LABEL }) as HTMLInputElement;
const typeAndLeave = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.blur(field());
};
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: LABEL }));
const todayCell = () => document.querySelector('[data-slot="date-picker"] [data-today]');
const caption = () =>
  document.querySelector(
    '[data-slot="date-picker"] [role="status"], [data-slot="date-picker"] .rdp-caption_label',
  );

afterEach(() => vi.useRealTimers());

describe('DateInput', () => {
  it.each(['05/10/2026', '05/oct/2026', '၀၅/၁၀/၂၀၂၆'])(
    'Scenario: Typed forms — %s shows 05/Oct/2026 and reports 2026-10-05',
    (typed) => {
      const onValue = vi.fn();
      renderIntl(<Demo onValue={onValue} />);
      typeAndLeave(typed);
      expect(field().value).toBe('05/Oct/2026');
      expect(onValue).toHaveBeenLastCalledWith('2026-10-05');
    },
  );

  it('Scenario: Impossible dates and the leap day — 31/02 and 29/02/2026 refused, 29/02/2028 taken', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    for (const typed of ['31/02/2026', '29/02/2026']) {
      typeAndLeave(typed);
      expect(screen.getByText('Enter a valid date, for example 05/Oct/2026.')).toBeDefined();
      expect(field().getAttribute('aria-invalid')).toBe('true');
      expect(onValue).toHaveBeenLastCalledWith(null);
    }
    typeAndLeave('29/02/2028');
    expect(screen.queryByText('Enter a valid date, for example 05/Oct/2026.')).toBeNull();
    expect(onValue).toHaveBeenLastCalledWith('2028-02-29');
    expect(field().value).toBe('29/Feb/2028');
  });

  it('an emptied field reports null without a message', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    typeAndLeave('05/10/2026');
    typeAndLeave('');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('Enter a valid date, for example 05/Oct/2026.')).toBeNull();
  });

  it('Scenario: The picker opens on the Myanmar date — clock 2026-10-04T18:00:00Z is 5 October', () => {
    renderIntl(<Demo now="2026-10-04T18:00:00Z" />);
    openPicker();
    expect(todayCell()?.textContent).toBe('5');
    expect(caption()?.textContent).toBe('October 2026');
  });

  it('Scenario: A phone with a wrong date — the picker still opens on 5 October 2026', () => {
    vi.useFakeTimers({ now: new Date('2020-01-01T09:00:00Z'), toFake: ['Date'] });
    renderIntl(<Demo />);
    openPicker();
    expect(todayCell()?.textContent).toBe('5');
    expect(caption()?.textContent).toBe('October 2026');
  });

  it('picking a day reports its business date and closes the picker', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /October 7th, 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith('2026-10-07');
    expect(field().value).toBe('07/Oct/2026');
    expect(document.querySelector('[data-slot="date-picker"]')).toBeNull();
  });

  it('min and max: days outside cannot be picked, and a typed day outside is refused', () => {
    const onValue = vi.fn();
    renderIntl(<Demo min="2026-10-05" max="2026-10-10" onValue={onValue} />);
    openPicker();
    expect(
      (screen.getByRole('button', { name: /October 4th, 2026/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /October 11th, 2026/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    act(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));
    typeAndLeave('04/10/2026');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Enter a valid date, for example 05/Oct/2026.')).toBeDefined();
  });

  it('names the calendar button by the field label and says it opens a dialog', () => {
    renderIntl(<Demo />);
    const button = screen.getByRole('button', { name: LABEL });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
