import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../../../common/database/prisma.service.js';
import { OpeningHoursRepository } from './opening-hours.repository.js';

const row = (opens_at: Date | null, closes_at: Date | null) => ({
  day_of_week: 1,
  is_closed: opens_at === null,
  opens_at,
  closes_at,
});

// A `time` column arrives as a Date on 1970-01-01 UTC; the wire form is `HH:MM` (API-DATA-03 ·
// CG-TIME-02 · CG-TIME-04).
describe('OpeningHoursRepository.ofBranch', () => {
  it.each([
    ['1970-01-01T09:05:00Z', '1970-01-01T18:30:00Z', '09:05', '18:30'],
    ['1970-01-01T00:00:00Z', '1970-01-01T23:59:00Z', '00:00', '23:59'],
  ])('reads %s and %s as %s and %s', async (opens, closes, from, to) => {
    const prisma = {
      branch_opening_hours: {
        findMany: async () => [row(new Date(opens), new Date(closes))],
      },
    } as unknown as PrismaService;
    const days = await new OpeningHoursRepository(prisma).ofBranch('branch-1');
    expect(days.map(({ opens_at, closes_at }) => [opens_at, closes_at])).toStrictEqual([
      [from, to],
    ]);
  });

  it('keeps a missing time as null', async () => {
    const prisma = {
      branch_opening_hours: { findMany: async () => [row(null, null)] },
    } as unknown as PrismaService;
    const days = await new OpeningHoursRepository(prisma).ofBranch('branch-1');
    expect(days.map(({ opens_at, closes_at }) => [opens_at, closes_at])).toStrictEqual([
      [null, null],
    ]);
  });
});
