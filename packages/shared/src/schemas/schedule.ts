import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import { CATALOGUE_CODE_PREFIX } from './catalogue-code.js';
import { wireDate, wireDateTime } from './wire.js';

// The weekly pattern and the shift reads of add-schedule-patterns (API Part 2 v1.6 P2.PAT.01 / 02 ·
// P2.SHF.01 / 02 / 06 · OpenAPI 1.6.0 PatternSegment / PatternDay / PatternSet / PatternSetWrite / Shift /
// LeaveBlock / Roster · API-ERR-03 · design D2 · task 2.1). Request schemas are plain objects (unknown
// members stripped — CG-API-03); the response DTOs are strict.
//
// Field codes (spec "Segment times and dates are checked before the business rules" · reading 5): a
// segment that does not end after it starts and an `effective_to` before `effective_from` →
// `end_before_start`; two segments of one day that overlap → `segment_overlap` on the later one (touching
// is not overlapping); a malformed time, a weekday outside 1 … 7, more than 7 days or a weekday sent twice
// → the Zod issue name (`invalid_format`, `too_small` / `too_big`, `invalid_value`).

/** ISO weekdays, 1 Monday … 7 Sunday — `day_of_week` of `schedule_patterns`. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** The most dates one roster read covers (P2.SHF.01 — "at most 42 dates"). */
export const ROSTER_MAX_DATES = 42;

const catalogue = (code: string): string => `${CATALOGUE_CODE_PREFIX}${code}`;

const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** `HH:MM`, 24-hour, Myanmar Time (the OpenAPI pattern `^([01][0-9]|2[0-3]):[0-5][0-9]$`). */
export const timeOfDaySchema = z.string().regex(TIME_OF_DAY);

/**
 * Both times well-formed: Zod 4 runs an object's checks after a continuable member issue, so the order
 * and overlap checks compare only `HH:MM` values (a malformed time has its own `invalid_format`).
 */
const wellFormed = (segment: { start_time: string; end_time: string }): boolean =>
  TIME_OF_DAY.test(segment.start_time) && TIME_OF_DAY.test(segment.end_time);

export const patternSegmentSchema = z
  .object({ branch_id: z.uuid(), start_time: timeOfDaySchema, end_time: timeOfDaySchema })
  .check((ctx) => {
    // `HH:MM` compares as text in time order.
    if (wellFormed(ctx.value) && ctx.value.end_time <= ctx.value.start_time) {
      ctx.issues.push({
        code: 'custom',
        message: catalogue(ErrorCode.END_BEFORE_START),
        path: ['end_time'],
        input: ctx.value.end_time,
      });
    }
  });

export const patternDaySchema = z
  .object({ day_of_week: z.int().min(1).max(7), segments: z.array(patternSegmentSchema) })
  .check((ctx) => {
    // In start order, a segment that starts before the latest end so far overlaps an earlier one.
    if (!ctx.value.segments.every(wellFormed)) return;
    const ordered = ctx.value.segments
      .map((segment, index) => ({ ...segment, index }))
      .sort((a, b) => {
        const byStart = a.start_time.localeCompare(b.start_time);
        return byStart === 0 ? a.index - b.index : byStart;
      });
    let latestEnd: string | null = null;
    for (const segment of ordered) {
      if (latestEnd !== null && segment.start_time < latestEnd) {
        ctx.issues.push({
          code: 'custom',
          message: catalogue(ErrorCode.SEGMENT_OVERLAP),
          path: ['segments', segment.index],
          input: segment,
        });
      }
      if (latestEnd === null || segment.end_time > latestEnd) latestEnd = segment.end_time;
    }
  });

export const patternSetWriteSchema = z
  .object({
    effective_from: wireDate,
    effective_to: wireDate.nullable().optional(),
    days: z.array(patternDaySchema).max(7),
  })
  .check((ctx) => {
    const { effective_from: from, effective_to: to, days } = ctx.value;
    if (to !== undefined && to !== null && to < from) {
      ctx.issues.push({
        code: 'custom',
        message: catalogue(ErrorCode.END_BEFORE_START),
        path: ['effective_to'],
        input: to,
      });
    }
    // A weekday sent twice (reading 5 — a Zod issue name): `invalid_value` on the second one, whose
    // allowed values are the weekdays not sent before it — a named code with its `error.*` text.
    const seen = new Set<number>();
    for (const [index, day] of days.entries()) {
      if (seen.has(day.day_of_week)) {
        ctx.issues.push({
          code: 'invalid_value',
          values: WEEKDAYS.filter((weekday) => !seen.has(weekday)),
          path: ['days', index, 'day_of_week'],
          input: day.day_of_week,
        });
      }
      seen.add(day.day_of_week);
    }
  });

export type PatternSegment = z.infer<typeof patternSegmentSchema>;
export type PatternDay = z.infer<typeof patternDaySchema>;
export type PatternSetWrite = z.infer<typeof patternSetWriteSchema>;

/** P2.PAT.01 query: `as_of` (default today, MMT — the API fills it) and `include_history`. */
export const patternQuerySchema = z.object({
  as_of: wireDate.optional(),
  include_history: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type PatternQuery = z.infer<typeof patternQuerySchema>;

/** Inclusive date count of `from` … `to` (both `YYYY-MM-DD`), over UTC midnights — no zone maths. */
function datesIn(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

/**
 * P2.SHF.01 / 02 query: `from` … `to` inclusive, at most 42 dates (P2.SHF.01). Both refusals are on `to`:
 * before `from` → `end_before_start`; a 43rd date → the Zod issue `too_big` with maximum 42.
 */
export const rosterQuerySchema = z
  .object({
    branch_id: z.uuid().optional(),
    employee_id: z.uuid().optional(),
    from: wireDate,
    to: wireDate,
  })
  .check((ctx) => {
    const { from, to } = ctx.value;
    if (to < from) {
      ctx.issues.push({
        code: 'custom',
        message: catalogue(ErrorCode.END_BEFORE_START),
        path: ['to'],
        input: to,
      });
    } else if (datesIn(from, to) > ROSTER_MAX_DATES) {
      ctx.issues.push({
        code: 'too_big',
        origin: 'number',
        maximum: ROSTER_MAX_DATES,
        inclusive: true,
        path: ['to'],
        input: to,
      });
    }
  });

export type RosterQuery = z.infer<typeof rosterQuerySchema>;

/** P2.SHF.06 body. The API raises `from` to today and lowers `to` to the horizon (reading 7). */
export const generateRequestSchema = z.object({
  branch_id: z.uuid(),
  from: wireDate.optional(),
  to: wireDate.optional(),
  employee_id: z.uuid().optional(),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

// Response DTOs.

const patternSegmentDto = z.strictObject({
  branch_id: z.uuid(),
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
});

const patternDayDto = z.strictObject({
  day_of_week: z.int().min(1).max(7),
  segments: z.array(patternSegmentDto),
});

const patternSetFields = {
  employee_id: z.uuid(),
  /** null = no set effective on `as_of` — every day off, `days` = [] (owner PT1). */
  effective_from: wireDate.nullable(),
  effective_to: wireDate.nullable(),
  days: z.array(patternDayDto).max(7),
};

/** P2.PAT.01 / 02 answer; `history` (every non-archived set) only with `include_history=true`. */
export const patternSetSchema = z.strictObject({
  ...patternSetFields,
  history: z.array(z.strictObject(patternSetFields)).optional(),
});

export type PatternSet = z.infer<typeof patternSetSchema>;

/**
 * A warning of a pattern save (P2.PAT.02 `warnings[]` · OpenAPI Part 2 `Warning` with `items`): the shifts
 * a regeneration kept because attendance points at them (P2-RULE-07 · P5-RULE-14), and the BOOKED bookings
 * it left outside the employee's shifts (P2-RULE-08 · D-BKG-19) — a booking is listed by id, branch and its
 * own start and end, no customer data (design D9).
 */
export const shiftKeptAttendanceWarningSchema = z.strictObject({
  code: z.literal('shift_kept_attendance'),
  items: z.array(z.strictObject({ shift_id: z.uuid(), shift_date: wireDate })),
});

export const bookingsOutsideShiftWarningSchema = z.strictObject({
  code: z.literal('bookings_outside_shift'),
  items: z.array(
    z.strictObject({
      booking_id: z.uuid(),
      branch_id: z.uuid(),
      starts_at: wireDateTime,
      ends_at: wireDateTime,
    }),
  ),
});

export const scheduleWarningSchema = z.discriminatedUnion('code', [
  shiftKeptAttendanceWarningSchema,
  bookingsOutsideShiftWarningSchema,
]);

export type ScheduleWarning = z.infer<typeof scheduleWarningSchema>;

/** A shift; `source` = `schedule_shifts.source` (1 PATTERN · 2 MANUAL — DB Part 2 v1.3). */
export const shiftSchema = z.strictObject({
  id: z.uuid(),
  employee_id: z.uuid(),
  branch_id: z.uuid(),
  shift_date: wireDate,
  starts_at: wireDateTime,
  ends_at: wireDateTime,
  source: z.literal([1, 2]),
  schedule_pattern_id: z.uuid().nullable().optional(),
  /** true = a branch outside the caller's read scope — times only (AD-CAL-03). */
  redacted: z.boolean().optional(),
  updated_at: wireDateTime,
});

export type Shift = z.infer<typeof shiftSchema>;

/** A leave block of the roster; `add-schedule-roster` fills `leaves` (reading 12). */
export const leaveBlockSchema = z.strictObject({
  leave_id: z.uuid(),
  employee_id: z.uuid(),
  start_at: wireDateTime,
  end_at: wireDateTime,
  status: z.literal([1, 2]),
  leave_type_id: z.uuid(),
});

export type LeaveBlock = z.infer<typeof leaveBlockSchema>;

/** P2.SHF.01 / 02 answer: one closure entry per closed date (reading 12). */
export const rosterSchema = z.strictObject({
  items: z.array(shiftSchema),
  leaves: z.array(leaveBlockSchema),
  closures: z.array(
    z.strictObject({
      branch_id: z.uuid(),
      date: wireDate,
      notice_mm: z.string().nullable().optional(),
      notice_en: z.string().nullable().optional(),
    }),
  ),
});

export type Roster = z.infer<typeof rosterSchema>;
