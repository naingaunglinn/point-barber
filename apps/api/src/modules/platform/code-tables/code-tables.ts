import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';

import { LOGGER } from '../../../common/logging/logger.js';
import { Jobs } from '../jobs/jobs.service.js';

// The job `sync.code_tables` (ADR-002 · D-ROLE-08 · D-PLT-16 · add-foundation-auth-access design D1 ·
// D9 · D10): sent once at every API start with a singleton key; it brings the code tables in line
// with the files of packages/shared/definitions and writes the base seed. Owned by Part 1 but it
// syncs every part's files, so it lives in platform; each module contributes its steps here (people:
// the permission catalogue, then the base seed; add-settings-store and the notifications change add
// theirs). Each step opens its own transaction.

export const SYNC_CODE_TABLES = 'sync.code_tables';

interface Step {
  readonly name: string;
  readonly order: number;
  readonly run: () => Promise<void>;
}

@Injectable()
export class CodeTables implements OnModuleInit {
  private readonly steps: Step[] = [];

  constructor(
    private readonly jobs: Jobs,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** Adds a step; steps run by ascending `order`. */
  contribute(name: string, order: number, run: () => Promise<void>): void {
    this.steps.push({ name, order, run });
    this.steps.sort((a, b) => a.order - b.order);
  }

  onModuleInit(): void {
    this.jobs.register(SYNC_CODE_TABLES, () => this.runAll());
    this.jobs.sendAtStart(SYNC_CODE_TABLES, {}, { singletonKey: SYNC_CODE_TABLES });
  }

  /** Every step, in order. The job handler; tests call it directly. */
  async runAll(): Promise<void> {
    for (const step of this.steps) {
      await step.run();
      this.log.info({ step: step.name }, `${SYNC_CODE_TABLES} step done`);
    }
  }
}
