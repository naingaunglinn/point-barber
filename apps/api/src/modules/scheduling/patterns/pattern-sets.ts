import { Injectable } from '@nestjs/common';
import type { PatternSet } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';
import type { StoredSegment } from './pattern-plan.js';

// The pattern sets of an employee as P2.PAT.01 answers them (D-SCH-01 · design D7): the set effective on
// a date — `days` by weekday, each day's segments by start; no set → every day off, `effective_from` =
// `effective_to` = null and `days` = [] (owner PT1) — and, for `include_history`, every non-archived set
// grouped by its start date, in start order.

/** One set's rows (one `effective_from`) as a `PatternSet`; no rows = every day off (PT1). */
export function toPatternSet(employeeId: string, rows: readonly StoredSegment[]): PatternSet {
  const first = rows[0];
  if (first === undefined) {
    return { employee_id: employeeId, effective_from: null, effective_to: null, days: [] };
  }
  const days = new Map<number, { branch_id: string; start_time: string; end_time: string }[]>();
  for (const row of [...rows].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  )) {
    const segments = days.get(row.day_of_week) ?? [];
    segments.push({ branch_id: row.branch_id, start_time: row.start_time, end_time: row.end_time });
    days.set(row.day_of_week, segments);
  }
  return {
    employee_id: employeeId,
    effective_from: first.effective_from,
    effective_to: first.effective_to,
    days: [...days.entries()].map(([day_of_week, segments]) => ({ day_of_week, segments })),
  };
}

@Injectable()
export class PatternSets {
  constructor(private readonly patterns: PatternsRepository) {}

  /** The set effective on `date`, or every day off (PT1). */
  async effectiveOn(db: Tx, employeeId: string, date: string): Promise<PatternSet> {
    return toPatternSet(employeeId, await this.patterns.effectiveOn(db, employeeId, date));
  }

  /** Every non-archived set of the employee — past, current and scheduled — in start order. */
  async history(db: Tx, employeeId: string): Promise<PatternSet[]> {
    const sets = new Map<string, StoredSegment[]>();
    for (const row of await this.patterns.history(db, employeeId)) {
      sets.set(row.effective_from, [...(sets.get(row.effective_from) ?? []), row]);
    }
    return [...sets.values()].map((rows) => toPatternSet(employeeId, rows));
  }
}
