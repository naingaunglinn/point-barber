import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { CATALOGUE_CODE_PREFIX } from './catalogue-code.js';
import {
  generateRequestSchema,
  patternQuerySchema,
  patternSetSchema,
  patternSetWriteSchema,
  rosterQuerySchema,
  rosterSchema,
  scheduleWarningSchema,
  shiftSchema,
} from './schedule.js';

// add-schedule-patterns task 2.1 — scheduling spec "Segment times and dates are checked before the
// business rules" (P2.PAT.02 · API-ERR-03 · Part 2 §13b · reading 5), the PT1 answer of P2.PAT.01 and
// the 42-date limit of P2.SHF.01. Fixture values: Ko Aung at B3 (spec-fixtures §2, §10.1).
const B1 = '0199a3f2-0000-7000-8001-0000000000b1';
const B3 = '0199a3f2-0000-7000-8001-0000000000b3';
const KO_AUNG = '0199a3f2-0000-7000-8003-00000000e004';

/** The `errors[]` the API answers for a schema failure: the catalogue code or the Zod issue name. */
function fieldErrorsOf(schema: z.ZodType, value: unknown): { field: string; code: string }[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path
      .map((key) => (typeof key === 'number' ? `[${key}]` : `.${String(key)}`))
      .join('')
      .replace(/^\./, ''),
    code: issue.message.startsWith(CATALOGUE_CODE_PREFIX)
      ? issue.message.slice(CATALOGUE_CODE_PREFIX.length)
      : issue.code,
  }));
}

const seg = (startTime: string, endTime: string, branchId = B3) => ({
  branch_id: branchId,
  start_time: startTime,
  end_time: endTime,
});

/** Ko Aung's set from 12/Oct/2026 whose day 1 holds `segments`. */
const write = (segments: unknown[], extra: Record<string, unknown> = {}) => ({
  effective_from: '2026-10-12',
  days: [{ day_of_week: 1, segments }],
  ...extra,
});

describe('add-schedule-patterns · scheduling · Segment times and dates are checked before the business rules', () => {
  it('Scenario: A segment that ends when it starts — end_before_start on its end_time', () => {
    expect(fieldErrorsOf(patternSetWriteSchema, write([seg('13:00', '13:00')]))).toStrictEqual([
      { field: 'days[0].segments[0].end_time', code: 'end_before_start' },
    ]);
  });

  it('Scenario: Overlapping segments — segment_overlap on the later segment', () => {
    expect(
      fieldErrorsOf(patternSetWriteSchema, write([seg('09:00', '13:00'), seg('12:00', '20:00')])),
    ).toStrictEqual([{ field: 'days[0].segments[1]', code: 'segment_overlap' }]);
  });

  it('Scenario: Touching segments at one branch — 13:00 end and 13:00 start pass', () => {
    expect(
      fieldErrorsOf(patternSetWriteSchema, write([seg('09:00', '13:00'), seg('13:00', '20:00')])),
    ).toStrictEqual([]);
  });

  it('Scenario: End date before start date — end_before_start on effective_to', () => {
    expect(
      fieldErrorsOf(
        patternSetWriteSchema,
        write([seg('09:00', '21:00')], { effective_to: '2026-10-11' }),
      ),
    ).toStrictEqual([{ field: 'effective_to', code: 'end_before_start' }]);
  });

  it('an end date on the start date, a null end date and no end date pass', () => {
    for (const extra of [{ effective_to: '2026-10-12' }, { effective_to: null }, {}]) {
      expect(
        fieldErrorsOf(patternSetWriteSchema, write([seg('09:00', '21:00')], extra)),
      ).toStrictEqual([]);
    }
  });

  it('reads the overlap in time order: sent later-first, the later segment is index 0', () => {
    expect(
      fieldErrorsOf(patternSetWriteSchema, write([seg('12:00', '20:00'), seg('09:00', '13:00')])),
    ).toStrictEqual([{ field: 'days[0].segments[0]', code: 'segment_overlap' }]);
  });

  it('a long segment overlaps every segment inside it', () => {
    expect(
      fieldErrorsOf(
        patternSetWriteSchema,
        write([seg('09:00', '20:00'), seg('10:00', '11:00'), seg('12:00', '13:00')]),
      ),
    ).toStrictEqual([
      { field: 'days[0].segments[1]', code: 'segment_overlap' },
      { field: 'days[0].segments[2]', code: 'segment_overlap' },
    ]);
  });

  it('segments at two branches that overlap are refused by the schema, before the gap check', () => {
    expect(
      fieldErrorsOf(
        patternSetWriteSchema,
        write([seg('09:00', '13:00', B1), seg('12:30', '18:00', B3)]),
      ),
    ).toStrictEqual([{ field: 'days[0].segments[1]', code: 'segment_overlap' }]);
  });

  it('a weekday sent twice → invalid_value on the second one, its values the weekdays not sent', () => {
    const body = {
      effective_from: '2026-10-12',
      days: [
        { day_of_week: 1, segments: [seg('09:00', '13:00')] },
        { day_of_week: 1, segments: [seg('14:00', '18:00')] },
      ],
    };
    expect(fieldErrorsOf(patternSetWriteSchema, body)).toStrictEqual([
      { field: 'days[1].day_of_week', code: 'invalid_value' },
    ]);
    expect(patternSetWriteSchema.safeParse(body).error?.issues[0]).toMatchObject({
      code: 'invalid_value',
      values: [2, 3, 4, 5, 6, 7],
    });
  });

  it.each([['9:00'], ['24:00'], ['09:60'], ['09:00:00']])(
    'a time that is not HH:MM (%s) → invalid_format',
    (time) => {
      expect(fieldErrorsOf(patternSetWriteSchema, write([seg(time, '21:00')]))).toStrictEqual([
        { field: 'days[0].segments[0].start_time', code: 'invalid_format' },
      ]);
    },
  );

  it('a weekday outside 1 … 7 and an eighth day → the Zod bounds', () => {
    expect(
      fieldErrorsOf(patternSetWriteSchema, {
        effective_from: '2026-10-12',
        days: [{ day_of_week: 0, segments: [] }],
      }),
    ).toStrictEqual([{ field: 'days[0].day_of_week', code: 'too_small' }]);
    expect(
      fieldErrorsOf(patternSetWriteSchema, {
        effective_from: '2026-10-12',
        days: [{ day_of_week: 8, segments: [] }],
      }),
    ).toStrictEqual([{ field: 'days[0].day_of_week', code: 'too_big' }]);
    const eight = Array.from({ length: 8 }, (_, i) => ({ day_of_week: (i % 7) + 1, segments: [] }));
    expect(
      fieldErrorsOf(patternSetWriteSchema, { effective_from: '2026-10-12', days: eight }),
    ).toStrictEqual([
      { field: 'days', code: 'too_big' },
      // Eight days of 1 … 7 repeat one.
      { field: 'days[7].day_of_week', code: 'invalid_value' },
    ]);
  });

  it('Scenario: Every day off — days = [] is a valid set', () => {
    expect(
      patternSetWriteSchema.parse({ effective_from: '2026-10-19', days: [], extra: 1 }),
    ).toStrictEqual({ effective_from: '2026-10-19', days: [] });
  });

  it('a missing effective_from → invalid_type', () => {
    expect(fieldErrorsOf(patternSetWriteSchema, { days: [] })).toStrictEqual([
      { field: 'effective_from', code: 'invalid_type' },
    ]);
  });
});

describe('patternQuerySchema (P2.PAT.01)', () => {
  it('reads include_history=true; without it, false', () => {
    expect(
      patternQuerySchema.parse({ include_history: 'true', as_of: '2026-10-05' }),
    ).toStrictEqual({
      include_history: true,
      as_of: '2026-10-05',
    });
    expect(patternQuerySchema.parse({})).toStrictEqual({ include_history: false });
  });

  it('refuses another value and a malformed date', () => {
    expect(fieldErrorsOf(patternQuerySchema, { include_history: 'yes' })).toStrictEqual([
      { field: 'include_history', code: 'invalid_value' },
    ]);
    expect(fieldErrorsOf(patternQuerySchema, { as_of: '05/Oct/2026' })).toStrictEqual([
      { field: 'as_of', code: 'invalid_format' },
    ]);
  });
});

describe('add-schedule-patterns · scheduling · Reading the roster of a period — the 42-day limit', () => {
  it('Scenario: The 42-day limit — 05/Oct … 15/Nov (42 dates) passes, 16/Nov is refused on to', () => {
    expect(
      fieldErrorsOf(rosterQuerySchema, { from: '2026-10-05', to: '2026-11-15' }),
    ).toStrictEqual([]);
    expect(
      fieldErrorsOf(rosterQuerySchema, { from: '2026-10-05', to: '2026-11-16' }),
    ).toStrictEqual([{ field: 'to', code: 'too_big' }]);
  });

  it('one date passes; to before from → end_before_start on to', () => {
    expect(
      fieldErrorsOf(rosterQuerySchema, { from: '2026-10-05', to: '2026-10-05' }),
    ).toStrictEqual([]);
    expect(
      fieldErrorsOf(rosterQuerySchema, { from: '2026-10-05', to: '2026-10-04' }),
    ).toStrictEqual([{ field: 'to', code: 'end_before_start' }]);
  });

  it('the 43rd date carries the bound 42', () => {
    const result = rosterQuerySchema.safeParse({ from: '2026-10-05', to: '2026-11-16' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ code: 'too_big', maximum: 42 });
  });
});

describe('generateRequestSchema (P2.SHF.06)', () => {
  it('needs branch_id; from, to and employee_id are optional', () => {
    expect(generateRequestSchema.parse({ branch_id: B3 })).toStrictEqual({ branch_id: B3 });
    expect(fieldErrorsOf(generateRequestSchema, {})).toStrictEqual([
      { field: 'branch_id', code: 'invalid_type' },
    ]);
  });
});

describe('the response DTOs (OpenAPI 1.6.0)', () => {
  it('Scenario: No pattern yet — effective_from and effective_to null, days [] (owner PT1)', () => {
    const empty = { employee_id: KO_AUNG, effective_from: null, effective_to: null, days: [] };
    expect(patternSetSchema.parse(empty)).toStrictEqual(empty);
  });

  it("Ko Aung's set with its history", () => {
    const set = {
      employee_id: KO_AUNG,
      effective_from: '2026-09-01',
      effective_to: null,
      days: [{ day_of_week: 1, segments: [seg('09:00', '21:00')] }],
    };
    expect(patternSetSchema.parse({ ...set, history: [set] })).toStrictEqual({
      ...set,
      history: [set],
    });
    expect(patternSetSchema.safeParse({ ...set, extra: 1 }).success).toBe(false);
  });

  it('a shift, a redacted shift and the roster envelope', () => {
    const shift = {
      id: '0199a3f2-0000-7000-8099-000000000001',
      employee_id: KO_AUNG,
      branch_id: B3,
      shift_date: '2026-10-05',
      starts_at: '2026-10-05T09:00:00+06:30',
      ends_at: '2026-10-05T21:00:00+06:30',
      source: 1,
      schedule_pattern_id: null,
      updated_at: '2026-10-05T00:30:00+06:30',
    };
    expect(shiftSchema.parse(shift)).toStrictEqual(shift);
    expect(shiftSchema.parse({ ...shift, redacted: true })).toMatchObject({ redacted: true });
    expect(shiftSchema.safeParse({ ...shift, source: 3 }).success).toBe(false);
    const roster = {
      items: [shift],
      leaves: [],
      closures: [{ branch_id: B3, date: '2026-10-10', notice_mm: 'ပိတ်ရက်', notice_en: null }],
    };
    expect(rosterSchema.parse(roster)).toStrictEqual(roster);
  });
});

describe('add-schedule-patterns · scheduling · A shift that attendance points at is kept — the warning', () => {
  it('Scenario: Already clocked in — `shift_kept_attendance` carries items of { shift_id, shift_date }', () => {
    const warning = {
      code: 'shift_kept_attendance',
      items: [{ shift_id: '0199a3f2-0000-7000-8000-000000000001', shift_date: '2026-10-05' }],
    };
    expect(scheduleWarningSchema.parse(warning)).toStrictEqual(warning);
    expect(
      scheduleWarningSchema.safeParse({ code: 'shift_kept_attendance', items: [{}] }).success,
    ).toBe(false);
  });

  it('bookings_outside_shift lists the bookings — id, branch and the booking’s own times, no customer', () => {
    const warning = {
      code: 'bookings_outside_shift',
      items: [
        {
          booking_id: '0199a3f2-0000-7000-8004-000000000001',
          branch_id: B3,
          starts_at: '2026-10-17T16:00:00+06:30',
          ends_at: '2026-10-17T16:30:00+06:30',
        },
      ],
    };
    expect(scheduleWarningSchema.parse(warning)).toStrictEqual(warning);
    const [item] = warning.items;
    expect(
      scheduleWarningSchema.safeParse({
        code: warning.code,
        items: [{ ...item, customer_name: 'Ma Su' }],
      }).success,
    ).toBe(false);
    expect(scheduleWarningSchema.safeParse({ code: 'unknown', items: [] }).success).toBe(false);
  });
});
