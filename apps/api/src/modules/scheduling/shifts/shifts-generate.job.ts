import { Inject, Injectable } from '@nestjs/common';
import { wireDate } from '@point/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { Audit, SiteContent } from '../../platform/index.js';
import { ScheduleLock } from '../patterns/schedule-lock.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';
import { ScheduleEvents } from './schedule-events.js';
import { ShiftGenerator } from './shift-generator.js';

// The job `shifts.generate` (ADR-002 · design D5 · P2-RULE-07): the nightly run at 00:30 Myanmar time (data
// `{}`: every employee with a set effective in today … the horizon) and the run P2.SHF.06 asks for now (data
// `{ branch_id, from, to, employee_ids, requested_by }`, computed with the caller's grants — owner PT6).
// One transaction per employee (lock, generator, events). A failing employee does not stop the others; after
// them all, one transaction writes the audit row and queues `site.revalidate ['barbers']`, and only then
// the handler throws if any failed — so pg-boss retries (finished employees are no-ops) and dead-letters.

export const SHIFTS_GENERATE = 'shifts.generate';
/** 00:30 every day (Asia/Yangon is the `Jobs` default). */
export const SHIFTS_GENERATE_CRON = '30 0 * * *';
export const SCHEDULE_GENERATE = 'schedule.generate';

const requestedSchema = z.strictObject({
  branch_id: z.uuid(),
  from: wireDate,
  to: wireDate,
  employee_ids: z.array(z.uuid()),
  requested_by: z.uuid(),
});
const dataSchema = z.union([z.strictObject({}), requestedSchema]);

export type ShiftsGenerateRequest = z.infer<typeof requestedSchema>;

@Injectable()
export class ShiftsGenerateJob {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly generator: ShiftGenerator,
    private readonly lock: ScheduleLock,
    private readonly patterns: PatternsRepository,
    private readonly events: ScheduleEvents,
    private readonly audit: Audit,
    private readonly site: SiteContent,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async run(raw: unknown): Promise<void> {
    const data = dataSchema.parse(raw);
    const requested = 'employee_ids' in data ? data : null;
    const { today, horizon } = await this.generator.span();
    const from = requested === null || requested.from < today ? today : requested.from;
    const to = requested === null || requested.to > horizon ? horizon : requested.to;
    const employeeIds =
      requested?.employee_ids ??
      (await this.runner.run((tx) => this.patterns.employeesWithSets(tx, from, to)));

    const changed: string[] = [];
    const failed: string[] = [];
    for (const employeeId of employeeIds) {
      try {
        const result = await this.runner.run(async (tx) => {
          await this.lock.acquire(tx, employeeId);
          const generated = await this.generator.run(tx, { employee_id: employeeId, from, to });
          await this.events.collect(tx, employeeId, generated.changed);
          return generated;
        });
        if (result.changed.length > 0) changed.push(employeeId);
      } catch (error) {
        failed.push(employeeId);
        this.log.error({ err: error, employee_id: employeeId }, 'shifts.generate: employee failed');
      }
    }

    await this.runner.run(async (tx) => {
      // The nightly run writes its own row, only when it changed a shift; P2.SHF.06 wrote its row at the
      // request (proposal reading 11).
      if (requested === null && changed.length > 0) {
        this.audit.emitSystem({
          action: SCHEDULE_GENERATE,
          entity_type: 'schedule_shifts',
          after: { from, to, employees: changed.length },
        });
      }
      await this.site.touch(tx, ['barbers']);
    });

    if (failed.length > 0) {
      throw new Error(`shifts.generate: ${String(failed.length)} employee(s) failed`);
    }
  }
}
