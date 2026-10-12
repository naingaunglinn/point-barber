import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ClockProvider } from '../../providers/clock';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { DateText } from './DateText';

// ui-foundation "Dates are typed, picked and shown as DD/MMM/YYYY on the Myanmar calendar date" and
// "Dates and times are formatted in Myanmar Time" (D-PLT-05 · D-PLT-15 · AD-FMT-02 · AD-FMT-03 · design D10).
const NOW = '2026-10-05T10:42:00+06:30';

function show(ui: ReactElement, locale: 'my' | 'en' = 'en', now = NOW) {
  return renderIntl(
    <ClockProvider now={now}>
      <FormatProvider locale={locale} profile="app">
        {ui}
      </FormatProvider>
    </ClockProvider>,
    { locale },
  );
}

describe('DateText', () => {
  it('Scenario: Today and yesterday in a list — Today, Yesterday, 03/Oct/2026', () => {
    show(
      <>
        <DateText value="2026-10-05" relativeDay />
        <DateText value="2026-10-04" relativeDay />
        <DateText value="2026-10-03" relativeDay />
      </>,
    );
    const times = [...document.querySelectorAll('time')].map((t) => t.textContent);
    expect(times).toEqual(['Today', 'Yesterday', '03/Oct/2026']);
  });

  it('uses the words of the UI language for today and yesterday', () => {
    show(
      <>
        <DateText value="2026-10-05" relativeDay />
        <DateText value="2026-10-04" relativeDay />
      </>,
      'my',
    );
    expect([...document.querySelectorAll('time')].map((t) => t.textContent)).toEqual([
      'ယနေ့',
      'မနေ့က',
    ]);
  });

  it('takes the day of an instant in Myanmar Time: 17:30 UTC is already tomorrow', () => {
    show(<DateText value="2026-10-04T17:30:00Z" relativeDay />);
    expect(document.querySelector('time')?.textContent).toBe('Today');
  });

  it('shows the date with the weekday, the time and the date and time', () => {
    show(
      <>
        <DateText value="2026-10-06" weekday />
        <DateText value={NOW} mode="time" />
        <DateText value={NOW} mode="datetime" />
        <DateText value="14:30" mode="time" />
      </>,
      'my',
    );
    expect([...document.querySelectorAll('time')].map((t) => t.textContent)).toEqual([
      'အင်္ဂါ, 06/Oct/2026',
      '10:42 AM',
      '05/Oct/2026 10:42 AM',
      '2:30 PM',
    ]);
  });

  it('keeps the machine value in dateTime', () => {
    show(<DateText value="2026-10-05" />);
    expect(document.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-05');
  });

  it('follows the clock: after Myanmar midnight the same date is yesterday', () => {
    show(<DateText value="2026-10-05" relativeDay />, 'en', '2026-10-05T17:30:00Z');
    expect(document.querySelector('time')?.textContent).toBe('Yesterday');
  });
});
