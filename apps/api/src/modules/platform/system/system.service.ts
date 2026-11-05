import { Inject, Injectable } from '@nestjs/common';
import { type Health, type SystemStatus, toMmtIso } from '@point/shared';
import type { Logger } from 'pino';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { DatabaseProbe } from '../../../common/database/prisma.service.js';
import { HEALTH_PING_TIMEOUT_MS } from '../../../common/limits.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { SettingsReader } from '../settings/settings-reader.js';

@Injectable()
export class SystemService {
  constructor(
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly database: DatabaseProbe,
    private readonly settings: SettingsReader,
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
   * P1.SYS.02 — the effective company value of `system.maintenance` (D-PLT-08 · add-settings-store
   * design D9): while no row exists its default `{ enabled: false }` applies, so `maintenance` is
   * false and the other three are null; version = APP_VERSION (design D9).
   */
  async status(): Promise<SystemStatus> {
    const { 'system.maintenance': maintenance } = await this.settings.effective([
      'system.maintenance',
    ]);
    return {
      maintenance: maintenance.enabled,
      until: maintenance.until ?? null,
      message_mm: maintenance.message_mm ?? null,
      message_en: maintenance.message_en ?? null,
      version: this.config.env.APP_VERSION,
      server_time: toMmtIso(this.clock.now()),
    };
  }
}
