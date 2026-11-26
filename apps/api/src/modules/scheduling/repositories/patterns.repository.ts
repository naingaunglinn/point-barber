import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { NewSegment, StoredSegment } from '../patterns/pattern-plan.js';

// `schedule_patterns` (DB Part 2 v1.3 — the scheduling module owns it): one row per segment of a weekday,
// `day_of_week` 1 Monday … 7 Sunday, times in Myanmar Time, `effective_from` … `effective_to` both
// inclusive (NULL = open), `archived_at` for a segment removed by an edit in place (D-DB-06). Rows are
// never deleted (D-DAT-05). Times come back as `HH:MM`, dates as `YYYY-MM-DD`.

const rowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  day_of_week: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  effective_from: z.string(),
  effective_to: z.string().nullable(),
});

const SELECT = Prisma.sql`
  SELECT id, branch_id, day_of_week,
         to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
         effective_from::text AS effective_from, effective_to::text AS effective_to
  FROM schedule_patterns`;

@Injectable()
export class PatternsRepository {
  /** `pg_advisory_xact_lock(hashtextextended('schedule:' || employee_id, 0))`, held to commit (D6). */
  async lockEmployee(tx: Tx, employeeId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${employeeId}`}, 0))`;
  }

  /**
   * The non-archived rows effective on `date` (the set of that date), by weekday and start;
   * `lock` = `FOR UPDATE` (design D3 step 4, under `ScheduleLock`).
   */
  async effectiveOn(
    db: Tx,
    employeeId: string,
    date: string,
    options: { readonly lock?: boolean } = {},
  ): Promise<StoredSegment[]> {
    const rows = await db.$queryRaw<unknown[]>`
      ${SELECT}
      WHERE employee_id = ${employeeId}::uuid AND archived_at IS NULL
        AND effective_from <= ${date}::date
        AND (effective_to IS NULL OR effective_to >= ${date}::date)
      ORDER BY day_of_week, start_time, id
      ${options.lock === true ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
    return z.array(rowSchema).parse(rows);
  }

  /**
   * Every non-archived row of the employee — past, current and scheduled sets — by start date; a read
   * no source caps, so it stops at `READ_ROW_CEILING` and fails loudly above it (CG-PERF-02).
   */
  async history(db: Tx, employeeId: string): Promise<StoredSegment[]> {
    const rows = await db.$queryRaw<unknown[]>`
      ${SELECT}
      WHERE employee_id = ${employeeId}::uuid AND archived_at IS NULL
      ORDER BY effective_from, day_of_week, start_time, id
      LIMIT ${READ_ROW_CEILING + 1}`;
    return assertWithinCeiling(z.array(rowSchema).parse(rows), 'PatternsRepository.history');
  }

  /**
   * The non-archived rows effective anywhere in `from` … `to` — the sets the generator plans from
   * (design D4 step 2); one date's set is the part of them effective on that date.
   */
  async effectiveIn(
    db: Tx,
    employeeId: string,
    from: string,
    to: string,
  ): Promise<StoredSegment[]> {
    const rows = await db.$queryRaw<unknown[]>`
      ${SELECT}
      WHERE employee_id = ${employeeId}::uuid AND archived_at IS NULL
        AND effective_from <= ${to}::date
        AND (effective_to IS NULL OR effective_to >= ${from}::date)
      ORDER BY effective_from, day_of_week, start_time, id`;
    return z.array(rowSchema).parse(rows);
  }

  /** The start of the first non-archived set after `date`, or null (owner PT2). */
  async nextStartAfter(db: Tx, employeeId: string, date: string): Promise<string | null> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT min(effective_from)::text AS next FROM schedule_patterns
      WHERE employee_id = ${employeeId}::uuid AND archived_at IS NULL
        AND effective_from > ${date}::date`;
    return z.array(z.object({ next: z.string().nullable() })).parse(rows)[0]?.next ?? null;
  }

  async insert(
    tx: Tx,
    rows: readonly (NewSegment & {
      readonly id: string;
      readonly employee_id: string;
      readonly effective_from: string;
      readonly effective_to: string | null;
    })[],
    at: Date,
  ): Promise<void> {
    for (const row of rows) {
      await tx.$executeRaw`
        INSERT INTO schedule_patterns
          (id, employee_id, branch_id, day_of_week, start_time, end_time, effective_from, effective_to,
           created_at, updated_at)
        VALUES (${row.id}::uuid, ${row.employee_id}::uuid, ${row.branch_id}::uuid, ${row.day_of_week},
                ${row.start_time}::time, ${row.end_time}::time, ${row.effective_from}::date,
                ${row.effective_to}::date, ${at}, ${at})`;
    }
  }

  /** Sets the end of the rows (`null` = open again): a set closed at `D − 1`, or a kept row retimed. */
  async setEnd(
    tx: Tx,
    ids: readonly string[],
    effectiveTo: string | null,
    at: Date,
  ): Promise<void> {
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE schedule_patterns SET effective_to = ${effectiveTo}::date, updated_at = ${at}
      WHERE id = ANY(${ids}::uuid[])`;
  }

  /** Archives the rows an edit in place removed (D-DB-06 — the shifts keep their FK). */
  async archive(tx: Tx, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE schedule_patterns SET archived_at = ${at}, updated_at = ${at}
      WHERE id = ANY(${ids}::uuid[]) AND archived_at IS NULL`;
  }

  /** The employees with a non-archived pattern row effective anywhere in `from` … `to` — the nightly run's set. */
  async employeesWithSets(db: Tx, from: string, to: string): Promise<string[]> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT DISTINCT employee_id FROM schedule_patterns
      WHERE archived_at IS NULL AND effective_from <= ${to}::date
        AND (effective_to IS NULL OR effective_to >= ${from}::date)
      ORDER BY employee_id
      LIMIT ${READ_ROW_CEILING + 1}`;
    return assertWithinCeiling(
      z.array(z.object({ employee_id: z.uuid() })).parse(rows),
      'PatternsRepository.employeesWithSets',
    ).map((row) => row.employee_id);
  }

  /** The branches of the non-archived segments effective anywhere in `from` … `to`, per employee. */
  async branchesOf(
    db: Tx,
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<{ employee_id: string; branch_id: string }[]> {
    if (employeeIds.length === 0) return [];
    const rows = await db.$queryRaw<unknown[]>`
      SELECT DISTINCT employee_id, branch_id FROM schedule_patterns
      WHERE employee_id = ANY(${employeeIds}::uuid[]) AND archived_at IS NULL
        AND effective_from <= ${to}::date
        AND (effective_to IS NULL OR effective_to >= ${from}::date)`;
    return z.array(z.object({ employee_id: z.uuid(), branch_id: z.uuid() })).parse(rows);
  }
}
