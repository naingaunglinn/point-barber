// The package itself does no I/O (CG-ARCH-07); only this test reads files, so only it sees Node.
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SETTINGS, type SettingKey, settingDefault } from './catalogue.js';
import { type MessageTree, settingDefinitionProblems, settingTextProblems } from './definitions.js';

// add-settings-store tasks 1.1 – 1.3 — the definition file (D-PLT-16 · P1-RULE-08 · design D2 / D3):
// the entry shape, the key pattern of the DB CHECK, unique keys, every default within its own
// validation, the typed copy kept current, and the fourteen entries of this change.
const shared = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const definitionsFile = join(shared, 'definitions/settings.json');
const json = z
  .array(z.record(z.string(), z.unknown()))
  .parse(JSON.parse(readFileSync(definitionsFile, 'utf8')));
const generator = join(shared, 'scripts/generate-settings.mjs');

/** settings.json with one entry changed. */
const withEntry = (key: string, change: Record<string, unknown>): unknown[] =>
  json.map((entry) => (entry.key === key ? { ...entry, ...change } : entry));

/** The `settings` namespace of one language (packages/i18n — the owner-approved copy, S18). */
const messageTree: z.ZodType<MessageTree> = z.lazy(() =>
  z.record(z.string(), z.union([z.string(), messageTree])),
);
const settingsTexts = (language: 'my' | 'en'): MessageTree =>
  messageTree.parse(
    JSON.parse(readFileSync(join(shared, `../i18n/messages/${language}/settings.json`), 'utf8')),
  );

const runGenerator = (...args: string[]) =>
  spawnSync(process.execPath, [generator, '--check', ...args], { encoding: 'utf8' });

describe('add-settings-store · settings · Setting definitions live in one file in code', () => {
  it('the file is valid: entry shape, key pattern, unique keys, every default in its validation', () => {
    expect(settingDefinitionProblems(json)).toStrictEqual([]);
  });

  it('Scenario: A key the file does not define does not compile', () => {
    const known: SettingKey = 'booking.slot_interval_minutes';
    // @ts-expect-error — 'booking.slot_intervall_minutes' is not in settings.json; `pnpm typecheck`
    // fails here the day SettingKey accepts any string.
    const typo: SettingKey = 'booking.slot_intervall_minutes';
    expect([known, typo]).toHaveLength(2);
  });

  it('Scenario: A stale generated copy fails the check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'point-settings-'));
    try {
      const source = join(dir, 'settings.json');
      const added = {
        ...json[0],
        key: 'booking.extra_minutes',
        label_key: 'settings.booking.extra_minutes.label',
        help_key: 'settings.booking.extra_minutes.help',
        impact_key: null,
      };
      writeFileSync(source, JSON.stringify([...json, added]));
      const result = runGenerator(`--source=${source}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src/settings/settings.generated.ts is stale');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the typed copy equals the JSON file (settings:generate --check)', () => {
    const result = runGenerator();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(SETTINGS).toStrictEqual(json);
  });

  it('Scenario: A malformed key is refused', () => {
    const problems = settingDefinitionProblems(
      withEntry('booking.slot_interval_minutes', {
        key: 'BOOKING interval',
        label_key: 'settings.BOOKING interval.label',
        help_key: 'settings.BOOKING interval.help',
        impact_key: null,
      }),
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.startsWith('BOOKING interval: '))).toBe(true);
  });

  it('Scenario: A default outside its own validation is refused', () => {
    expect(
      settingDefinitionProblems(withEntry('system.upload_max_mb', { default: 11 })),
    ).toStrictEqual(['system.upload_max_mb: the default 11 fails its validation']);
  });

  it('label_key, help_key and impact_key — and the group, unit and choice labels — exist in my and en', () => {
    expect(
      settingTextProblems(SETTINGS, { my: settingsTexts('my'), en: settingsTexts('en') }),
    ).toStrictEqual([]);
  });

  it('a text key missing in one language is refused and named', () => {
    const my = z
      .looseObject({
        booking: z.looseObject({ slot_interval_minutes: z.record(z.string(), z.unknown()) }),
      })
      .parse(settingsTexts('my'));
    const { impact: _impact, ...slotWithoutImpact } = my.booking.slot_interval_minutes;
    const broken = messageTree.parse({
      ...my,
      booking: { ...my.booking, slot_interval_minutes: slotWithoutImpact },
    });
    expect(settingTextProblems(SETTINGS, { my: broken, en: settingsTexts('en') })).toStrictEqual([
      'my: booking.slot_interval_minutes: no text for settings.booking.slot_interval_minutes.impact',
    ]);
  });

  it('a key declared twice, an unknown scope and text keys of another key are refused', () => {
    expect(settingDefinitionProblems([...json, json[0]])).toStrictEqual([
      'booking.advance_window_days: declared twice',
    ]);
    expect(
      settingDefinitionProblems(withEntry('receipt.auto_print', { scope: 'global' })),
    ).toMatchObject([expect.stringMatching(/^receipt\.auto_print: .* at scope$/)]);
    expect(
      settingDefinitionProblems(
        withEntry('receipt.auto_print', { label_key: 'settings.receipt.autoprint.label' }),
      ),
    ).toStrictEqual(['receipt.auto_print: label_key = settings.<key>.label']);
  });
});

// Design D3 — the fourteen entries; add-branch-management appends attendance.default_radius_meters
// when it merges after this change (design D3 note).
describe('add-settings-store · settings · The settings of this change and their defaults', () => {
  it('holds the fourteen keys of design D3 in AD-SET-01 group order, by key inside a module', () => {
    expect(SETTINGS.map((entry) => `${entry.module} ${entry.key}`)).toStrictEqual([
      'booking booking.advance_window_days',
      'booking booking.slot_interval_minutes',
      'booking home_service.transport_fee_amount',
      'booking home_service.travel_minutes',
      'sales receipt.auto_print',
      'sales receipt.printer_width_mm',
      'sales receipt.thank_you_text',
      'sales sales.service_charge_enabled',
      'sales sales.tax_enabled',
      'closing closing.cash_difference_tolerance_amount',
      'dashboard dashboard.show_own_earnings_all',
      'system system.default_language',
      'system system.maintenance',
      'system system.upload_max_mb',
    ]);
  });

  it('the twelve keys of the old DEFAULT_SETTINGS keep their values; the two new ones their defaults', () => {
    expect(Object.fromEntries(SETTINGS.map((entry) => [entry.key, entry.default]))).toStrictEqual({
      'booking.slot_interval_minutes': 15,
      'booking.advance_window_days': 14,
      'sales.tax_enabled': false, // D-PAY-08 — OFF
      'sales.service_charge_enabled': false, // D-PAY-08 — OFF
      'closing.cash_difference_tolerance_amount': 0,
      'home_service.transport_fee_amount': 0, // 0 = the shop pays (D-SVC-06)
      'system.default_language': 1, // 1 MY (D-PLT-03)
      'system.upload_max_mb': 10,
      'receipt.printer_width_mm': 58, // D-PAY-07
      'receipt.auto_print': false, // REC-37
      'dashboard.show_own_earnings_all': false, // D-DSH-03
      'home_service.travel_minutes': 30, // D-SCH-03
      // New in this change: no thank-you line (owner SS1); maintenance off (D-PLT-08).
      'receipt.thank_you_text': null,
      'system.maintenance': { enabled: false },
    });
  });

  it('Scenario: The client-readable set — exactly the ten keys of P1.SET.02', () => {
    expect(
      SETTINGS.filter((entry) => entry.client_readable)
        .map((entry) => entry.key)
        .sort(),
    ).toStrictEqual(
      [
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
      ].sort(),
    );
  });

  it('Scenario: Which keys allow a branch override — exactly the three branch keys', () => {
    expect(
      SETTINGS.filter((entry) => entry.scope === 'branch').map((entry) => entry.key),
    ).toStrictEqual([
      'home_service.transport_fee_amount',
      'home_service.travel_minutes',
      'receipt.printer_width_mm',
    ]);
  });

  it('read-only: system.maintenance (P1.SYS.03) and the tax and service-charge switches (owner SS4)', () => {
    expect(
      SETTINGS.filter((entry) => 'read_only' in entry && entry.read_only).map((entry) => entry.key),
    ).toStrictEqual(['sales.service_charge_enabled', 'sales.tax_enabled', 'system.maintenance']);
  });

  it('an impact note on the slot interval, the advance window, the transport fee and the tolerance', () => {
    expect(
      SETTINGS.filter((entry) => entry.impact_key !== null).map((entry) => entry.key),
    ).toStrictEqual([
      'booking.advance_window_days',
      'booking.slot_interval_minutes',
      'home_service.transport_fee_amount', // owner SS3 = C, 02/Nov/2026
      'closing.cash_difference_tolerance_amount',
    ]);
  });

  it('the limits of owner SS3 and the choices of D-BKG-07, D-PAY-07 and D-PLT-03', () => {
    expect(
      Object.fromEntries(SETTINGS.map((entry) => [entry.key, entry.validation])),
    ).toStrictEqual({
      'booking.advance_window_days': { unit: 'days', min: 0 },
      'booking.slot_interval_minutes': { unit: 'minutes', choices: [5, 10, 15, 30] },
      'home_service.transport_fee_amount': { unit: 'MMK', min: 0 },
      'home_service.travel_minutes': { unit: 'minutes', min: 0 },
      'receipt.auto_print': {},
      'receipt.printer_width_mm': { unit: 'mm', choices: [58, 80] },
      'receipt.thank_you_text': { max_length: 200, nullable: true },
      'sales.service_charge_enabled': {},
      'sales.tax_enabled': {},
      'closing.cash_difference_tolerance_amount': { unit: 'MMK', min: 0 },
      'dashboard.show_own_earnings_all': {},
      'system.default_language': { choices: [1, 2] },
      'system.maintenance': {},
      'system.upload_max_mb': { unit: 'MB', min: 1, max: 10 },
    });
  });

  it('a default is handed out as a copy, so a caller cannot change it', () => {
    const value = settingDefault('system.maintenance') as { enabled: boolean };
    value.enabled = true;
    expect(settingDefault('system.maintenance')).toStrictEqual({ enabled: false });
  });
});
