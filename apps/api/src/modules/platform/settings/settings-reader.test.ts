import { describe, expect, it } from 'vitest';

import { MaintenanceGate, OpenMaintenanceGate } from './maintenance-gate.js';
import {
  CLIENT_READABLE_KEYS,
  DEFAULT_SETTINGS,
  DefaultsSettingsReader,
  SettingsReader,
} from './settings-reader.js';
import { NoTodayBranch, TodayBranch } from './today-branch.js';

// add-foundation-auth-access task 2.12 — API-AUTH-05 · P1.SET.02 · Part 1 §8 · P1-RULE-06 · D-PLT-16 ·
// design D13: until add-settings-store exists, every setting is its locked default ("no row =
// default"), the maintenance gate is open and nobody has a today branch.
describe('DefaultsSettingsReader (task 2.12)', () => {
  it('holds the locked defaults of P1.SET.02, Part 1 §8, Part 4 and D-SCH-03', () => {
    expect(DEFAULT_SETTINGS).toStrictEqual({
      'booking.slot_interval_minutes': 15,
      'booking.advance_window_days': 14,
      'sales.tax_enabled': false, // Part 4: "default OFF" (D-PAY-08)
      'sales.service_charge_enabled': false, // Part 4: "default OFF" (D-PAY-08)
      'closing.cash_difference_tolerance_amount': 0,
      'home_service.transport_fee_amount': 0, // 0 = shop pays (D-SVC-06)
      'system.default_language': 1, // 1 MY
      'system.upload_max_mb': 10,
      'receipt.printer_width_mm': 58,
      'receipt.auto_print': false, // REC-37
      'dashboard.show_own_earnings_all': false, // P1-RULE-06 — not client-readable
      // add-walkin-visit-checkout — D-SCH-03, server-only (the quote's block length).
      'home_service.travel_minutes': 30,
    });
  });

  it('the client-readable list of P1.SET.02 is the ten keys without the earnings flag', () => {
    expect([...CLIENT_READABLE_KEYS].sort()).toStrictEqual(
      Object.keys(DEFAULT_SETTINGS)
        .filter(
          (key) =>
            key !== 'dashboard.show_own_earnings_all' && key !== 'home_service.travel_minutes',
        )
        .sort(),
    );
  });

  it('answers the default for any branch, and for the company', async () => {
    const reader: SettingsReader = new DefaultsSettingsReader();
    expect(
      await reader.effective(['receipt.printer_width_mm', 'system.default_language'], 'b3'),
    ).toStrictEqual({ 'receipt.printer_width_mm': 58, 'system.default_language': 1 });
    expect(await reader.effective(['dashboard.show_own_earnings_all'])).toStrictEqual({
      'dashboard.show_own_earnings_all': false,
    });
  });

  it('returns copies, so a caller cannot change a default', async () => {
    const reader = new DefaultsSettingsReader();
    const values = await reader.effective(['booking.slot_interval_minutes']);
    (values as Record<string, unknown>)['booking.slot_interval_minutes'] = 99;
    expect(await reader.effective(['booking.slot_interval_minutes'])).toStrictEqual({
      'booking.slot_interval_minutes': 15,
    });
  });
});

describe('the other two seams (task 2.12)', () => {
  it('the maintenance gate is open: system.maintenance cannot be set before P1.SYS.03 exists', async () => {
    const gate: MaintenanceGate = new OpenMaintenanceGate();
    await expect(gate.assertOpen()).resolves.toBeUndefined();
    expect(await gate.isOn()).toBe(false);
  });

  it('nobody has a today branch until scheduling and attendance exist (Part 1 §12)', async () => {
    const today: TodayBranch = new NoTodayBranch();
    expect(await today.of('any-employee')).toBeNull();
  });
});
