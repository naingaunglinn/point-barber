import { describe, expect, it } from 'vitest';

import { toDate } from '@point/shared';

import { FORMATTER_ROWS } from './formatter-rows';

// add-shared-ui-components task 4.6 · ui-foundation (AD-FMT-00..11 · design D5): the Formatters
// section has an input → output row for every function of D5, in both languages, at the catalogue
// clock — the default `now` of the spec, Monday 05/Oct/2026 10:42 MMT.
const NOW = toDate('2026-10-05T10:42:00+06:30');

const outputs = (fn: string) =>
  FORMATTER_ROWS.filter((row) => row.fn === fn).map((row) => [
    row.input,
    row.run('en', NOW),
    row.run('my', NOW),
  ]);

describe('the Formatters section', () => {
  it('has a row for every function of design D5 (and the lakh helper of D4)', () => {
    expect(new Set(FORMATTER_ROWS.map((row) => row.fn))).toEqual(
      new Set([
        'formatMoney',
        'formatLakh',
        'formatDate',
        'formatTime',
        'formatDateTime',
        'formatTimeRange',
        'formatDuration',
        'formatPercent',
        'formatQty',
        'formatRelativeTime',
        'formatPhone',
        'normalizePhone',
        'normalizeDigits',
        'businessDateOf',
        'todayMmt',
        'parseDateInput',
        'dateRangeForPreset',
        'localized',
        'normalizeMyanmarText',
      ]),
    );
  });

  it('shows the outputs of the spec in both languages', () => {
    expect(outputs('formatMoney')).toEqual([
      ['7000n · app', '7,000 Ks', '7,000 ကျပ်'],
      ['7000n · site', '7,000 Ks', '7,000 Ks'],
      ['1250000n · app · unit: false', '1,250,000', '1,250,000'],
    ]);
    expect(outputs('formatDate')).toEqual([
      ['2026-10-05', '05/Oct/2026', '05/Oct/2026'],
      ['2026-10-05 · weekday', 'Mon, 05/Oct/2026', 'တနင်္လာ, 05/Oct/2026'],
    ]);
    expect(outputs('formatTimeRange')).toEqual([
      ['14:30 – 15:15', '2:30 – 3:15 PM', '2:30 – 3:15 PM'],
      ['11:30 – 12:15', '11:30 AM – 12:15 PM', '11:30 AM – 12:15 PM'],
    ]);
    expect(outputs('formatDuration').map(([, en, my]) => [en, my])).toEqual([
      ['45 min', '45 မိနစ်'],
      ['1 h 30 min', '1 နာရီ 30 မိနစ်'],
      ['1 h', '1 နာရီ'],
      ['0 min', '0 မိနစ်'],
    ]);
    expect(outputs('formatDateTime')).toEqual([
      ['2026-10-05T10:42:00+06:30', '05/Oct/2026 10:42 AM', '05/Oct/2026 10:42 AM'],
    ]);
    expect(outputs('formatPhone')[0]?.[1]).toBe('09 7712 3456');
    expect(outputs('normalizePhone').map(([, en]) => en)).toEqual([
      '+95977123456',
      'phone_invalid',
    ]);
    expect(outputs('normalizeDigits')[0]?.[1]).toBe('0123456789');
  });

  it('reads the catalogue clock for relative times, today and the presets', () => {
    expect(outputs('formatRelativeTime').map(([, en]) => en)).toEqual([
      'just now',
      '5 min ago',
      '3 h ago',
      '03/Oct/2026',
    ]);
    expect(outputs('todayMmt')[0]?.[1]).toBe('2026-10-05');
    expect(outputs('dateRangeForPreset').map(([, en]) => en)).toEqual([
      '2026-10-05 – 2026-10-05',
      '2026-10-04 – 2026-10-04',
      '2026-10-05 – 2026-10-11',
      '2026-09-29 – 2026-10-05',
      '2026-10-01 – 2026-10-31',
      '2026-09-01 – 2026-09-30',
    ]);
  });

  it('Scenario: No Myanmar digit in Myanmar output', () => {
    for (const row of FORMATTER_ROWS) expect(row.run('my', NOW), row.fn).not.toMatch(/[၀-၉]/);
  });
});
