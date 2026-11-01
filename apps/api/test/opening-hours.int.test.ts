import { randomUUID } from 'node:crypto';

import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OpeningHours } from '../src/modules/platform/index.js';
import { openingHoursLine } from '../src/modules/sales/receipts/opening-hours-line.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout task 9.4 — the receipt's opening-hours line from the stored rows (design
// D10 · fixture module 080: 9:00 AM – 9:00 PM every day at B1 – B3). The `time` columns read back as
// `HH:MM` whatever the session zone (D-PLT-15).
let s: SeededApp;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
}, 60_000);
afterAll(() => s.close());

describe('OpeningHours.ofBranch', () => {
  it('B3: seven rows, Monday first, 09:00 – 21:00', async () => {
    const days = await s.app.get(OpeningHours).ofBranch(FIXTURE_IDS.branches.B3);
    expect(days).toStrictEqual(
      [1, 2, 3, 4, 5, 6, 7].map((day_of_week) => ({
        day_of_week,
        is_closed: false,
        opens_at: '09:00',
        closes_at: '21:00',
      })),
    );
    expect(openingHoursLine(days, 'Closed')).toBe('Mon–Sun 9:00 AM – 9:00 PM');
  });

  it('no rows → no line', async () => {
    const days = await s.app.get(OpeningHours).ofBranch(randomUUID());
    expect([days, openingHoursLine(days, 'Closed')]).toStrictEqual([[], null]);
  });
});
