import type { SettingKey } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { TransactionRunner } from '../../src/common/database/transaction-runner.js';
import { uuidV7 } from '../../src/common/http/uuid-v7.js';
import { SettingsRepository } from '../../src/modules/platform/repositories/settings.repository.js';
import type { FixturePerson, SeededApp } from './seeded.js';

// add-settings-store — a stored setting value for the scenarios that read one: the upsert of design D6
// as the store runs it, by a fixture person at the test clock's time (or `at`). The value must already
// be the parsed value (valueSchema) — the repository stores what it is given.

export async function storeSetting(
  s: SeededApp,
  key: SettingKey,
  value: unknown,
  options: { readonly branchId?: string; readonly by?: FixturePerson; readonly at?: Date } = {},
): Promise<{ id: string; inserted: boolean } | null> {
  const at = options.at ?? s.clock?.now() ?? new Date();
  const company = await s.prisma.companies.findFirstOrThrow({ select: { id: true } });
  return s.app.get(TransactionRunner).run((tx) =>
    s.app.get(SettingsRepository).upsert(tx, {
      id: uuidV7(at.getTime()),
      company_id: company.id,
      branch_id: options.branchId ?? null,
      key,
      value,
      actor_user_id: FIXTURE_IDS.users[options.by ?? 'E001'],
      at,
    }),
  );
}
