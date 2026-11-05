import { Injectable } from '@nestjs/common';
import { type SettingKey, type SettingValues, settingEntry } from '@point/shared';

import { SettingsRepository } from '../repositories/settings.repository.js';
import { CompanyOfSettings } from './ports.js';
import { resolveSetting } from './resolve.js';
import { SettingsReader } from './settings-reader.js';

// SettingsReader on the store (P1-RULE-08 · D-PLT-16 · add-settings-store design D4): one query per
// call for the rows of the keys — company and, when given, the branch — then resolution in memory:
// branch override (branch keys only) → company value → default. No cache: a change is read by the
// next call. Before the base seed there is no company and so no row: every key has its default.
@Injectable()
export class StoreSettingsReader extends SettingsReader {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly company: CompanyOfSettings,
  ) {
    super();
  }

  override async effective<K extends SettingKey>(
    keys: readonly K[],
    branchId?: string,
  ): Promise<SettingValues<K>> {
    const companyId = keys.length === 0 ? null : await this.company.id();
    const rows =
      companyId === null ? [] : await this.repository.rowsOf(companyId, keys, branchId ?? null);
    return Object.fromEntries(
      keys.map((key) => [
        key,
        // A copy: a caller that changes its value changes neither a default nor another caller's.
        structuredClone(resolveSetting(settingEntry(key), rows, branchId).effective),
      ]),
    ) as SettingValues<K>;
  }
}
