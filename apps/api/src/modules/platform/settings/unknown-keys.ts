import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { isSettingKey } from '@point/shared';
import type { Logger } from 'pino';

import { LOGGER } from '../../../common/logging/logger.js';
import { SettingsRepository } from '../repositories/settings.repository.js';

// The start-up check of add-settings-store (P1-RULE-08 · proposal reading 11 · task 2.10): a stored
// row whose key settings.json no longer defines is logged once at `warn` and left as it is — every
// read ignores it and nothing deletes a row (D-DAT-05). The database holds no definition and no
// default, so there is nothing to sync.
@Injectable()
export class UnknownSettingKeys implements OnApplicationBootstrap {
  constructor(
    private readonly repository: SettingsRepository,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.check();
  }

  /** The stored keys that settings.json does not define, each logged once. */
  async check(): Promise<string[]> {
    const unknown = (await this.repository.storedKeys()).filter((key) => !isSettingKey(key));
    for (const key of unknown) {
      this.log.warn(
        { key },
        'settings row with a key that settings.json does not define — ignored',
      );
    }
    return unknown;
  }
}
