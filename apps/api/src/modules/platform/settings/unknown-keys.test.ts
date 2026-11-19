import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import type { SettingsRepository } from '../repositories/settings.repository.js';
import { UnknownSettingKeys } from './unknown-keys.js';

// add-settings-store task 2.10 — the start-up check (P1-RULE-08 · proposal reading 11): a stored row
// whose key settings.json does not define is logged once at `warn`; the check deletes and writes
// nothing (D-DAT-05).
function checkWith(storedKeys: string[]) {
  const warnings: { fields: unknown; message: string }[] = [];
  let reads = 0;
  const repository = {
    storedKeys: () => {
      reads += 1;
      return Promise.resolve(storedKeys);
    },
  } as unknown as SettingsRepository;
  const log = {
    warn: (fields: unknown, message: string) => warnings.push({ fields, message }),
  } as unknown as Logger;
  return { check: new UnknownSettingKeys(repository, log), warnings, reads: () => reads };
}

describe('UnknownSettingKeys (task 2.10)', () => {
  it('logs each stored key that settings.json does not define, once, at warn', async () => {
    const { check, warnings, reads } = checkWith([
      'booking.slot_interval_minutes',
      'closing.close_roles',
      'sales.kbzpay_reference_regex',
    ]);
    await check.onApplicationBootstrap();
    expect(warnings).toStrictEqual([
      {
        fields: { key: 'closing.close_roles' },
        message: 'settings row with a key that settings.json does not define — ignored',
      },
      {
        fields: { key: 'sales.kbzpay_reference_regex' },
        message: 'settings row with a key that settings.json does not define — ignored',
      },
    ]);
    expect(reads()).toBe(1);
  });

  it('is quiet when every stored key is defined', async () => {
    const { check, warnings } = checkWith(['receipt.printer_width_mm']);
    expect(await check.check()).toStrictEqual([]);
    expect(warnings).toStrictEqual([]);
  });
});
