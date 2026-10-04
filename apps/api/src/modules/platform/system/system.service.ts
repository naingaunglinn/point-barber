import { Inject, Injectable } from '@nestjs/common';
import type { Health, SystemStatus } from '@point/shared';
import type { Logger } from 'pino';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { DatabaseProbe } from '../../../common/database/prisma.service.js';
import { toMmtIso } from '../../../common/http/mmt-iso.js';
import { HEALTH_PING_TIMEOUT_MS } from '../../../common/limits.js';
import { LOGGER } from '../../../common/logging/logger.js';

@Injectable()
export class SystemService {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly database: DatabaseProbe,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** P1.SYS.01 — a database ping with a timeout; the cause is logged, never returned (design D9). */
  async health(): Promise<Health> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('database ping timed out')),
        HEALTH_PING_TIMEOUT_MS,
      );
    });
    let status: Health['status'] = 'ok';
    try {
      await Promise.race([this.database.ping(), timeout]);
    } catch (error) {
      status = 'degraded';
      this.log.warn({ err: error }, 'health: database ping failed');
    } finally {
      clearTimeout(timer);
    }
    return { status, time: toMmtIso(this.clock.now()) };
  }

  /**
   * P1.SYS.02 — reads no table yet: maintenance stays off until add-settings-store builds P1.SYS.03
   * (the key's default { enabled: false }); version = APP_VERSION (design D9).
   */
  status(): SystemStatus {
    return {
      maintenance: false,
      until: null,
      message_mm: null,
      message_en: null,
      version: this.config.env.APP_VERSION,
      server_time: toMmtIso(this.clock.now()),
    };
  }
}
