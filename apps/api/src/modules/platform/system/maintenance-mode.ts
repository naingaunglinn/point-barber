import { Injectable } from '@nestjs/common';
import { ErrorCode, type MaintenanceValue, type SystemStatus } from '@point/shared';

import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { SettingsWrites } from '../settings/settings-writes.js';
import { SystemService } from './system.service.js';

// P1.SYS.03 — maintenance mode on / off (D-PLT-08 · P1-RULE-10 · owner SS2 · add-settings-store design
// D9): the company row of `system.maintenance` is written with the four members the body schema gives
// (absent → null) through the store's write path, audited `system.maintenance` with branch_id NULL, and
// the answer is the system status. `until` is only shown: maintenance stays on until it is turned off.
@Injectable()
export class MaintenanceMode {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly writes: SettingsWrites,
    private readonly system: SystemService,
  ) {}

  async set(value: MaintenanceValue): Promise<SystemStatus> {
    const actorUserId = RequestContext.current()?.user_id;
    if (actorUserId === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    await this.runner.run((tx) =>
      this.writes.write(tx, {
        key: 'system.maintenance',
        value,
        branchId: null,
        action: 'system.maintenance',
        actorUserId,
      }),
    );
    return this.system.status();
  }
}
