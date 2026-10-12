import { describe, expect, it } from 'vitest';

import { dateRangeForPreset, parseDateInput } from './date-input.js';

// AD-FORM-15 (typed dates) · AD-LIST-01 (date presets) · design D5: weeks run Monday–Sunday,
// "Last 7 days" = today and the 6 days before.
describe('parseDateInput', () => {
  it.each([
    ['05/10/2026', '2026-10-05'],
    ['05/Oct/2026', '2026-10-05'],
    ['05/oct/2026', '2026-10-05'],
    ['5/10/2026', '2026-10-05'],
    [' 05/Oct/2026 ', '2026-10-05'],
    ['၀၅/၁၀/၂၀၂၆', '2026-10-05'],
    ['၀၅/Oct/၂၀၂၆', '2026-10-05'],
    ['29/02/2028', '2028-02-29'],
    ['31/12/2026', '2026-12-31'],
  ])('%j → %s', (text, date) => {
    expect(parseDateInput(text)).toBe(date);
  });

  it.each([
    '31/02/2026',
    '29/02/2026',
    '00/10/2026',
    '05/13/2026',
    '05/Okt/2026',
    '2026-10-05',
    '05.10.2026',
    '05/10/26',
    '',
  ])('%j → date_invalid', (text) => {
    expect(parseDateInput(text)).toBe('date_invalid');
  });
});

describe('dateRangeForPreset', () => {
  it.each([
    ['today', '2026-10-05', '2026-10-05'],
    ['yesterday', '2026-10-04', '2026-10-04'],
    ['thisWeek', '2026-10-05', '2026-10-11'],
    ['last7Days', '2026-09-29', '2026-10-05'],
    ['thisMonth', '2026-10-01', '2026-10-31'],
    ['lastMonth', '2026-09-01', '2026-09-30'],
  ] as const)('on Monday 05/Oct/2026, %s = %s … %s', (preset, from, to) => {
    expect(dateRangeForPreset(preset, '2026-10-05')).toEqual({ from, to });
  });

  it.each([
    ['today', '2026-10-07', '2026-10-07'],
    ['yesterday', '2026-10-06', '2026-10-06'],
    ['thisWeek', '2026-10-05', '2026-10-11'],
    ['last7Days', '2026-10-01', '2026-10-07'],
    ['thisMonth', '2026-10-01', '2026-10-31'],
    ['lastMonth', '2026-09-01', '2026-09-30'],
  ] as const)('on Wednesday 07/Oct/2026, %s = %s … %s', (preset, from, to) => {
    expect(dateRangeForPreset(preset, '2026-10-07')).toEqual({ from, to });
  });

  it('crosses the year at the month boundary', () => {
    expect(dateRangeForPreset('lastMonth', '2027-01-15')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(dateRangeForPreset('yesterday', '2027-01-01')).toEqual({
      from: '2026-12-31',
      to: '2026-12-31',
    });
  });
});
