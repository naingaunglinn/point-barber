import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';

// The per-employee schedule lock (design D6 · CG-DB-08 · docs/engineering/module-map.md): key
// `schedule:<employee_id>`, a transaction-level exclusive advisory lock. Every writer of one employee's
// patterns and shifts takes it first — P2.PAT.02, each employee unit of the job `shifts.generate`, and
// add-schedule-roster's single-day writes — after the payroll lock and before any row lock. It is
// re-entrant inside one transaction, so the inline generation of a save takes it again without waiting.
@Injectable()
export class ScheduleLock {
  constructor(private readonly patterns: PatternsRepository) {}

  acquire(tx: Tx, employeeId: string): Promise<void> {
    return this.patterns.lockEmployee(tx, employeeId);
  }
}
