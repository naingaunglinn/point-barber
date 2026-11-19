import { Injectable } from '@nestjs/common';
import { ErrorCode, type MaintenanceSetting, todayMmt } from '@point/shared';

import { GrantSet } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { RegisteredGrantSource } from './ports.js';
import { SettingsReader } from './settings-reader.js';

// The maintenance step of P1-RULE-04 (API-AUTH-06 · D-PLT-08 · add-foundation-auth-access design D2 /
// D13 · add-settings-store design D9). The session guard calls assertOpen() after the session checks
// and the request cap and before the access guard; @Public() and @Internal() routes never reach it, and
// jobs do not pass through guards.
export abstract class MaintenanceGate {
  /** Resolves when the request may go on; rejects with the maintenance problem otherwise. */
  abstract assertOpen(): Promise<void>;
  /** `/me.system.maintenance`. */
  abstract isOn(): Promise<boolean>;
}

/**
 * On the store: one read of the effective `system.maintenance` (two queries: the company id and the
 * row). Off → the request goes on. On → the
 * caller's grant set is built (today in MMT) and kept in the request context for the access guard and
 * `/me`; a company-scope settings.update holder goes on, anyone else is answered 503 `maintenance` with
 * the expected end and the two messages. `until` is only shown: maintenance stays on until turned off.
 */
@Injectable()
export class StoreMaintenanceGate extends MaintenanceGate {
  constructor(
    private readonly settings: SettingsReader,
    private readonly grantSource: RegisteredGrantSource,
    private readonly clock: Clock,
  ) {
    super();
  }

  override async assertOpen(): Promise<void> {
    const maintenance = await this.current();
    if (!maintenance.enabled) return;
    const ctx = RequestContext.current();
    if (ctx?.employee_id !== undefined) {
      ctx.grants ??= GrantSet.build(
        await this.grantSource.rowsFor(ctx.employee_id),
        todayMmt(this.clock.now()),
      );
      if (ctx.grants.isCompany('settings.update')) return;
    }
    throw new ProblemException(ErrorCode.MAINTENANCE, 503, {
      context: {
        until: maintenance.until ?? null,
        message_mm: maintenance.message_mm ?? null,
        message_en: maintenance.message_en ?? null,
      },
    });
  }

  override async isOn(): Promise<boolean> {
    return (await this.current()).enabled;
  }

  private async current(): Promise<MaintenanceSetting> {
    return (await this.settings.effective(['system.maintenance']))['system.maintenance'];
  }
}
