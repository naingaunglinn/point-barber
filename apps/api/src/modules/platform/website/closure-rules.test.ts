import { ErrorCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import {
  closureArchiveProblem,
  closureDateProblem,
  closureEditProblem,
  closureState,
} from './closure-rules.js';

// add-website-management tasks 3.1 / 3.2 — the date rules of a created closure and the computed state
// (P8.WEB.06 · P8-RULE-12 · design D6 · proposal readings 5 and 6). "Today" is Monday 05/Oct/2026.
const TODAY = '2026-10-05';

describe('closureDateProblem — the date checks of a create, in the order of reading 6', () => {
  it('a closure that starts today or later is fine', () => {
    expect(closureDateProblem('2026-10-05', '2026-10-05', TODAY)).toBeNull();
    expect(closureDateProblem('2027-04-13', '2027-04-16', TODAY)).toBeNull();
  });

  it('yesterday is date_in_past', () => {
    expect(closureDateProblem('2026-10-04', '2026-10-05', TODAY)).toStrictEqual({
      code: ErrorCode.DATE_IN_PAST,
    });
  });

  it('366 closed days are fine, 367 are range_too_long with max_days 366', () => {
    // 12/Oct/2026 – 12/Oct/2027 is 365 + 1 = 366 days, both ends counted.
    expect(closureDateProblem('2026-10-12', '2027-10-12', TODAY)).toBeNull();
    expect(closureDateProblem('2026-10-12', '2027-10-13', TODAY)).toStrictEqual({
      code: ErrorCode.RANGE_TOO_LONG,
      context: { max_days: 366 },
    });
  });

  it('a leap year counts its 29/Feb as a day', () => {
    // 01/Mar/2027 – 29/Feb/2028 is 366 days only because 2028 is a leap year.
    expect(closureDateProblem('2027-03-01', '2028-02-29', TODAY)).toBeNull();
    expect(closureDateProblem('2027-03-01', '2028-03-01', TODAY)).toMatchObject({
      code: ErrorCode.RANGE_TOO_LONG,
    });
  });

  it('a start in the past that is also too long answers date_in_past first', () => {
    expect(closureDateProblem('2026-01-01', '2027-12-31', TODAY)).toStrictEqual({
      code: ErrorCode.DATE_IN_PAST,
    });
  });
});

describe('closureState — computed from the dates and archived_at, never stored (design D6)', () => {
  const closure = (start_date: string, end_date: string, archived = false) => ({
    start_date,
    end_date,
    archived_at: archived ? new Date('2026-10-01T00:00:00Z') : null,
  });

  it('upcoming, current (both ends count), ended', () => {
    expect(closureState(closure('2026-10-06', '2026-10-07'), TODAY)).toBe('upcoming');
    expect(closureState(closure('2026-10-05', '2026-10-07'), TODAY)).toBe('current');
    expect(closureState(closure('2026-10-03', '2026-10-05'), TODAY)).toBe('current');
    expect(closureState(closure('2026-10-01', '2026-10-04'), TODAY)).toBe('ended');
  });

  it('archived beats every date state', () => {
    for (const [start, end] of [
      ['2026-10-06', '2026-10-07'],
      ['2026-10-04', '2026-10-06'],
      ['2026-10-01', '2026-10-02'],
    ] as const) {
      expect(closureState(closure(start, end, true), TODAY)).toBe('archived');
    }
  });
});

// add-website-management tasks 4.1 / 4.3 — the checks of an edit and of an archive (P8.WEB.07 / 08 ·
// owner WM4 ★ · proposal reading 6).
describe('closureEditProblem — an edit by the closure state', () => {
  const current = { start_date: '2026-10-04', end_date: '2026-10-07' };
  const upcoming = { start_date: '2026-10-12', end_date: '2026-10-13' };
  const ended = { start_date: '2026-10-01', end_date: '2026-10-02' };

  it('a current closure may end today and keeps its start', () => {
    expect(closureEditProblem(current, { ...current, end_date: '2026-10-05' }, TODAY)).toBeNull();
  });

  it('a current closure with another start is closure_started', () => {
    expect(
      closureEditProblem(current, { ...current, start_date: '2026-10-05' }, TODAY),
    ).toStrictEqual({ status: 422, code: ErrorCode.CLOSURE_STARTED });
  });

  it('a current closure ending yesterday is date_in_past (WM4 ★)', () => {
    expect(
      closureEditProblem(current, { ...current, end_date: '2026-10-04' }, TODAY),
    ).toStrictEqual({ status: 422, code: ErrorCode.DATE_IN_PAST });
  });

  it('a closure that starts today is current: its start stays', () => {
    const today = { start_date: TODAY, end_date: '2026-10-08' };
    expect(closureEditProblem(today, { ...today, end_date: TODAY }, TODAY)).toBeNull();
    expect(closureEditProblem(today, { ...today, start_date: '2026-10-06' }, TODAY)).toStrictEqual({
      status: 422,
      code: ErrorCode.CLOSURE_STARTED,
    });
  });

  it('an ended closure is closure_past, whatever the body says', () => {
    expect(closureEditProblem(ended, ended, TODAY)).toStrictEqual({
      status: 422,
      code: ErrorCode.CLOSURE_PAST,
    });
  });

  it('an upcoming closure moves with the create rules', () => {
    expect(
      closureEditProblem(upcoming, { start_date: '2026-10-05', end_date: '2026-10-06' }, TODAY),
    ).toBeNull();
    expect(
      closureEditProblem(upcoming, { start_date: '2026-10-04', end_date: '2026-10-13' }, TODAY),
    ).toStrictEqual({ status: 422, code: ErrorCode.DATE_IN_PAST });
    expect(
      closureEditProblem(upcoming, { start_date: '2026-10-12', end_date: '2027-10-12' }, TODAY),
    ).toBeNull();
    expect(
      closureEditProblem(upcoming, { start_date: '2026-10-12', end_date: '2027-10-13' }, TODAY),
    ).toStrictEqual({ status: 422, code: ErrorCode.RANGE_TOO_LONG, context: { max_days: 366 } });
  });

  it('an end before the start is a 400 on the end', () => {
    expect(
      closureEditProblem(upcoming, { start_date: '2026-10-14', end_date: '2026-10-13' }, TODAY),
    ).toStrictEqual({ status: 400, code: ErrorCode.END_BEFORE_START });
  });
});

describe('closureArchiveProblem — only while no past day changes', () => {
  it('a closure that starts today or later can be archived', () => {
    expect(closureArchiveProblem({ start_date: TODAY, end_date: TODAY }, TODAY)).toBeNull();
    expect(
      closureArchiveProblem({ start_date: '2026-10-12', end_date: '2026-10-13' }, TODAY),
    ).toBeNull();
  });

  it('a started closure is closure_started, an ended one closure_past', () => {
    expect(closureArchiveProblem({ start_date: '2026-10-04', end_date: '2026-10-07' }, TODAY)).toBe(
      ErrorCode.CLOSURE_STARTED,
    );
    expect(closureArchiveProblem({ start_date: '2026-10-01', end_date: '2026-10-02' }, TODAY)).toBe(
      ErrorCode.CLOSURE_PAST,
    );
  });
});
