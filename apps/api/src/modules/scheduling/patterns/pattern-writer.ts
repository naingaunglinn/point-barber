import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type PatternSet,
  type PatternSetWrite,
  type ScheduleWarning,
  businessDateOf,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Assignments } from '../../people/index.js';
import { Audit, SettingsReader } from '../../platform/index.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';
import { ShiftGenerator } from '../shifts/shift-generator.js';
import { planSave } from './pattern-plan.js';
import { PatternSets, toPatternSet } from './pattern-sets.js';
import { PatternValidator } from './pattern-validator.js';
import { ScheduleLock } from './schedule-lock.js';

// P2.PAT.02 — save an employee's pattern set (P2-RULE-04 · P2-RULE-07 · owners PT2 / PT4 · design D3), in
// one READ COMMITTED transaction:
//   2. `D` = effective_from; D before today (Myanmar Time) → 422 effective_date_past.
//   3. ScheduleLock for the employee — every check below runs after it.
//   4. The set effective on D (rows FOR UPDATE) and the next later set; `schedule.update` must reach
//      every branch of the old ∪ new segments → else 403 forbidden.
//   5. PatternValidator: the cross-branch gap from the setting and the assignment on D → 422, `code` =
//      the first failure, `errors[]` = all.
//   6. The rows of planSave, archives and closes before inserts.
//   7. Nothing changed → no audit row (Audit.skip), no generation, no event.
//   8. ShiftGenerator over max(D, today) … horizon, still under the lock.
//   9. The own-save guard (owner C11 · PT5): the caller's own employee and the generation archived,
//      inserted or converted a shift dated today → 422 self_action; the transaction rolls back.
//  10. The audit row `schedule.pattern_set` with the set before and after; its branch = the segments'
//      one branch, else the employee's primary branch (`@Audited({ target: 'employee' })`).
//  11. The answer = the set effective on D + warnings.
// Step 10's booking warning, events and site touch come with A5.

export const SCHEDULE_PATTERN_SET = 'schedule.pattern_set';

export interface PatternSaved extends PatternSet {
  readonly warnings: ScheduleWarning[];
}

@Injectable()
export class PatternWriter {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly clock: Clock,
    private readonly lock: ScheduleLock,
    private readonly patterns: PatternsRepository,
    private readonly sets: PatternSets,
    private readonly validator: PatternValidator,
    private readonly generator: ShiftGenerator,
    private readonly assignments: Assignments,
    private readonly settings: SettingsReader,
    private readonly audit: Audit,
  ) {}

  save(
    employeeId: string,
    body: PatternSetWrite,
    grants: GrantSet,
    callerEmployeeId: string | undefined,
  ): Promise<PatternSaved> {
    return this.runner.run(async (tx) => {
      const now = this.clock.now();
      const from = body.effective_from;
      if (from < businessDateOf(now)) {
        throw new ProblemException(ErrorCode.EFFECTIVE_DATE_PAST, 422);
      }
      await this.lock.acquire(tx, employeeId);

      const old = await this.patterns.effectiveOn(tx, employeeId, from, { lock: true });
      const nextFrom = await this.patterns.nextStartAfter(tx, employeeId, from);
      const touched = new Set([
        ...old.map((row) => row.branch_id),
        ...body.days.flatMap((day) => day.segments.map((segment) => segment.branch_id)),
      ]);
      if ([...touched].some((branchId) => !grants.covers('schedule.update', branchId))) {
        throw new ProblemException(ErrorCode.FORBIDDEN, 403);
      }

      const { 'schedule.cross_branch_gap_minutes': gap } = await this.settings.effective([
        'schedule.cross_branch_gap_minutes',
      ]);
      const failures = this.validator.check(body, {
        gap_minutes: gap,
        assignments: await this.assignments.assignmentsOf(tx, employeeId, { from, to: from }),
      });
      const [first] = failures;
      if (first !== undefined) {
        throw new ProblemException(first.code, 422, {
          errors: failures.map((failure) =>
            'params' in failure
              ? { field: failure.field, code: failure.code, params: { ...failure.params } }
              : { field: failure.field, code: failure.code },
          ),
          ...('params' in first ? { context: { ...first.params } } : {}),
        });
      }

      const plan = planSave({ old, nextFrom, from, to: body.effective_to, days: body.days });
      if (!plan.changed) {
        this.audit.skip();
        return { ...toPatternSet(employeeId, old), warnings: [] };
      }
      await this.patterns.archive(tx, plan.archive, now);
      if (plan.close !== null) {
        await this.patterns.setEnd(tx, plan.close.ids, plan.close.effective_to, now);
      }
      await this.patterns.setEnd(tx, plan.retime, plan.effective_to, now);
      await this.patterns.insert(
        tx,
        plan.insert.map((segment) => ({
          ...segment,
          id: uuidV7(now.getTime()),
          employee_id: employeeId,
          effective_from: from,
          effective_to: plan.effective_to,
        })),
        now,
      );

      const today = businessDateOf(now);
      const generated = await this.generator.run(tx, {
        employee_id: employeeId,
        from: from > today ? from : today,
      });
      if (employeeId === callerEmployeeId && generated.changed_dates.includes(today)) {
        throw new ProblemException(ErrorCode.SELF_ACTION, 422);
      }

      const before = toPatternSet(employeeId, old);
      const after = await this.sets.effectiveOn(tx, employeeId, from);
      const branches = new Set(
        after.days.flatMap((day) => day.segments.map((segment) => segment.branch_id)),
      );
      await this.audit.emit({
        action: SCHEDULE_PATTERN_SET,
        entity_type: 'employees',
        entity_id: employeeId,
        employee_id: employeeId,
        branch_id: branches.size === 1 ? [...branches][0] : null,
        before: { ...before },
        after: { ...after },
      });
      return { ...after, warnings: generated.warnings };
    });
  }
}
