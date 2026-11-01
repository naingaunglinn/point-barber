import { Injectable } from '@nestjs/common';

// The settings seam (API-AUTH-05 · P1.SET.02 · D-PLT-16 · add-foundation-auth-access design D13).
// The settings store is built by add-settings-store; until then every setting is its locked default
// — "no row = default" is exactly D-PLT-16 — and that change swaps the implementation behind
// SettingsReader, moving the defaults into settings.json.

/** The settings the API reads, with their locked defaults. */
export const DEFAULT_SETTINGS = {
  'booking.slot_interval_minutes': 15,
  'booking.advance_window_days': 14,
  'sales.tax_enabled': false,
  'sales.service_charge_enabled': false,
  'closing.cash_difference_tolerance_amount': 0,
  'home_service.transport_fee_amount': 0,
  'system.default_language': 1,
  'system.upload_max_mb': 10,
  'receipt.printer_width_mm': 58,
  'receipt.auto_print': false,
  // Server-only: the company switch of P1-RULE-06's own-earnings flag.
  'dashboard.show_own_earnings_all': false,
  // add-walkin-visit-checkout — server-only, read by the price quote's block length (P2-RULE-10):
  // home travel time before and after a HOME visit, branch setting, default 30 minutes (D-SCH-03).
  'home_service.travel_minutes': 30,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type SettingValues<K extends SettingKey> = {
  readonly [P in K]: (typeof DEFAULT_SETTINGS)[P];
};

/** The client-readable keys `/me.settings` carries (P1.SET.02 — locked list). */
export const CLIENT_READABLE_KEYS = [
  'booking.slot_interval_minutes',
  'booking.advance_window_days',
  'sales.tax_enabled',
  'sales.service_charge_enabled',
  'closing.cash_difference_tolerance_amount',
  'home_service.transport_fee_amount',
  'system.default_language',
  'system.upload_max_mb',
  'receipt.printer_width_mm',
  'receipt.auto_print',
] as const satisfies readonly SettingKey[];

export abstract class SettingsReader {
  /** The effective value of each key — for `branchId` when given, else the company value. */
  abstract effective<K extends SettingKey>(
    keys: readonly K[],
    branchId?: string,
  ): Promise<SettingValues<K>>;
}

@Injectable()
export class DefaultsSettingsReader extends SettingsReader {
  override effective<K extends SettingKey>(
    keys: readonly K[],
    _branchId?: string,
  ): Promise<SettingValues<K>> {
    return Promise.resolve(
      Object.fromEntries(keys.map((key) => [key, DEFAULT_SETTINGS[key]])) as SettingValues<K>,
    );
  }
}
