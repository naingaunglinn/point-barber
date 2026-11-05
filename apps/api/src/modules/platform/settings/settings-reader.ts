import {
  type ClientReadableSettingKey,
  SETTINGS,
  type SettingKey,
  type SettingValues,
} from '@point/shared';

// The settings seam (API-AUTH-05 · P1.SET.02 · D-PLT-16 · add-foundation-auth-access design D13).
// add-settings-store implements it on the store (StoreSettingsReader — design D4): the keys, their
// types and defaults live in packages/shared/definitions/settings.json, and the values the admin set
// in table `settings`.

export type { SettingKey, SettingValues } from '@point/shared';

/** The client-readable keys `/me.settings` carries (P1.SET.02 — locked list), in file order. */
export const CLIENT_READABLE_KEYS: readonly ClientReadableSettingKey[] = SETTINGS.filter(
  (entry) => entry.client_readable,
).map((entry) => entry.key as ClientReadableSettingKey);

export abstract class SettingsReader {
  /** The effective value of each key — for `branchId` when given, else the company value. */
  abstract effective<K extends SettingKey>(
    keys: readonly K[],
    branchId?: string,
  ): Promise<SettingValues<K>>;
}
