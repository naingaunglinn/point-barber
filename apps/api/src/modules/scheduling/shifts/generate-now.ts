import { Injectable } from '@nestjs/common';
import { ErrorCode, type GenerateRequest } from '@point/shared';

import type { GrantSet } from '../../../common/access/grant-set.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { Assignments } from '../../people/index.js';
import { Audit, Jobs } from '../../platform/index.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';
import { ShiftsRepository } from '../repositories/shifts.repository.js';
import { ShiftGenerator } from './shift-generator.js';
import { SCHEDULE_GENERATE, SHIFTS_GENERATE } from './shifts-generate.job.js';

// P2.SHF.06 — run generation now for one branch (P2-RULE-07 · ADR-002 · owner PT6 · reading 7), in one
// transaction: `from` raised to today, `to` lowered to the horizon (`to` before `from` → 400 on `to`); the
// employees assigned to the branch in the range (narrowed by `employee_id`) whose segments and active shifts
// all lie at branches `schedule.update` reaches; the job is sent in the same transaction; one audit row.

@Injectable()
export class GenerateNow {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly generator: ShiftGenerator,
    private readonly assignments: Assignments,
    private readonly patterns: PatternsRepository,
    private readonly shifts: ShiftsRepository,
    private readonly jobs: Jobs,
    private readonly audit: Audit,
  ) {}

  request(body: GenerateRequest, grants: GrantSet): Promise<{ job_id: string }> {
    return this.runner.run(async (tx) => {
      const { today, horizon } = await this.generator.span();
      const from = body.from === undefined || body.from < today ? today : body.from;
      const to = body.to === undefined || body.to > horizon ? horizon : body.to;
      if (to < from) {
        throw new ProblemException(ErrorCode.VALIDATION, 400, {
          errors: [{ field: 'to', code: ErrorCode.END_BEFORE_START }],
        });
      }

      const atBranch = await this.assignments.employeesAt(tx, {
        branch_id: body.branch_id,
        from,
        to,
      });
      const candidates =
        body.employee_id === undefined
          ? atBranch
          : atBranch.filter((id) => id === body.employee_id);
      const touched = [
        ...(await this.patterns.branchesOf(tx, candidates, from, to)),
        ...(await this.shifts.branchesOf(tx, candidates, from, to)),
      ];
      const uncovered = new Set(
        touched
          .filter((row) => !grants.covers('schedule.update', row.branch_id))
          .map((row) => row.employee_id),
      );
      const employeeIds = candidates.filter((id) => !uncovered.has(id)).sort();

      const requestedBy = RequestContext.current()?.user_id;
      if (requestedBy === undefined)
        throw new Error('schedule: P2.SHF.06 without a signed-in user');
      const jobId = await this.jobs.send(tx, SHIFTS_GENERATE, {
        branch_id: body.branch_id,
        from,
        to,
        employee_ids: employeeIds,
        requested_by: requestedBy,
      });
      if (jobId === null) throw new Error('schedule: pg-boss did not queue shifts.generate');
      await this.audit.emit({
        action: SCHEDULE_GENERATE,
        entity_type: 'schedule_shifts',
        branch_id: body.branch_id,
        after: { from, to, employees: employeeIds.length },
      });
      return { job_id: jobId };
    });
  }
}
