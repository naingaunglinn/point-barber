import { Module } from '@nestjs/common';

import { SettingsRepository } from '../repositories/settings.repository.js';
import { CompanyOfSettings, SettingBranches, UserNames } from './ports.js';
import { SettingsController } from './settings.controller.js';
import { SettingsReader } from './settings-reader.js';
import { SettingsStore } from './settings-store.js';
import { StoreSettingsReader } from './store-settings-reader.js';
import { UnknownSettingKeys } from './unknown-keys.js';

// The settings store inside `platform` (Part 1 settings · add-settings-store design D1): its own Nest
// module so that the mail module — a child of PlatformModule whose `email.send` job reads
// `system.default_language` — and PlatformModule share one instance of the reader and of the ports
// people registers at start-up.
@Module({
  controllers: [SettingsController],
  providers: [
    SettingsRepository,
    CompanyOfSettings,
    UserNames,
    SettingBranches,
    StoreSettingsReader,
    { provide: SettingsReader, useExisting: StoreSettingsReader },
    SettingsStore,
    UnknownSettingKeys,
  ],
  exports: [SettingsReader, CompanyOfSettings, UserNames, SettingBranches, SettingsStore],
})
export class SettingsModule {}
