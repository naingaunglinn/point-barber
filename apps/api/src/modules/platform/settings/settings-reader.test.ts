import { FIXTURE_IDS } from '@point/shared/testing';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { SettingsRepository } from '../repositories/settings.repository.js';
import { CompanyOfSettings } from './ports.js';
import type { StoredSetting } from './resolve.js';
import { CLIENT_READABLE_KEYS, SettingsReader } from './settings-reader.js';
import { StoreSettingsReader } from './store-settings-reader.js';
import { NoTodayBranch, TodayBranch } from './today-branch.js';

// add-settings-store task 2.5 — SettingsReader on the store (P1-RULE-08 · foundation design D13 ·
// design D4): one query per call, resolution in memory, the default while no row exists. Rewritten from
// the foundation's test of DefaultsSettingsReader, which this change deletes.
const COMPANY = '0199a3f2-0000-7000-8000-00000000c001';
const { B1, B3 } = FIXTURE_IDS.branches;

interface Call {
  readonly companyId: string;
  readonly keys: readonly string[];
  readonly branchId: string | null;
}

interface LoggedError {
  readonly fields: unknown;
  readonly message: string;
}

function readerWith(rows: StoredSetting[], companyId: string | null = COMPANY) {
  const calls: Call[] = [];
  const errors: LoggedError[] = [];
  const log = {
    error: (fields: unknown, message: string) => errors.push({ fields, message }),
  } as unknown as Logger;
  const repository = {
    rowsOf: (id: string, keys: readonly string[], branchId: string | null) => {
      calls.push({ companyId: id, keys, branchId });
      return Promise.resolve(
        rows.filter(
          (row) => keys.includes(row.key) && (row.branch_id === null || row.branch_id === branchId),
        ),
      );
    },
  } as unknown as SettingsRepository;
  const company = new CompanyOfSettings();
  company.use(() => Promise.resolve(companyId));
  const reader: SettingsReader = new StoreSettingsReader(repository, company, log);
  return { reader, calls, errors };
}

const row = (key: string, branchId: string | null, value: unknown): StoredSetting => ({
  id: `0199a3f2-0000-7000-8000-${key.length.toString().padStart(12, '0')}`,
  key,
  branch_id: branchId,
  value,
  updated_at: new Date('2026-10-05T02:30:00Z'),
  updated_by_user_id: FIXTURE_IDS.users.E001,
});

describe('StoreSettingsReader (task 2.5)', () => {
  it('answers the defaults of settings.json while no row exists', async () => {
    const { reader } = readerWith([]);
    expect(
      await reader.effective(['receipt.printer_width_mm', 'system.default_language'], B3),
    ).toStrictEqual({ 'receipt.printer_width_mm': 58, 'system.default_language': 1 });
    expect(
      await reader.effective(['dashboard.show_own_earnings_all', 'receipt.thank_you_text']),
    ).toStrictEqual({
      'dashboard.show_own_earnings_all': false,
      'receipt.thank_you_text': null,
    });
  });

  it('reads the rows of the keys with one query: the company and the asked branch', async () => {
    const { reader, calls } = readerWith([
      row('home_service.transport_fee_amount', null, 2000),
      row('home_service.transport_fee_amount', B3, 3000),
      row('receipt.printer_width_mm', B3, 80),
    ]);
    expect(
      await reader.effective(['home_service.transport_fee_amount', 'receipt.printer_width_mm'], B3),
    ).toStrictEqual({
      'home_service.transport_fee_amount': 3000,
      'receipt.printer_width_mm': 80,
    });
    expect(
      await reader.effective(['home_service.transport_fee_amount', 'receipt.printer_width_mm'], B1),
    ).toStrictEqual({
      'home_service.transport_fee_amount': 2000,
      'receipt.printer_width_mm': 58,
    });
    expect(calls).toStrictEqual([
      {
        companyId: COMPANY,
        keys: ['home_service.transport_fee_amount', 'receipt.printer_width_mm'],
        branchId: B3,
      },
      {
        companyId: COMPANY,
        keys: ['home_service.transport_fee_amount', 'receipt.printer_width_mm'],
        branchId: B1,
      },
    ]);
  });

  it('without a branch, answers the company value', async () => {
    const { reader, calls } = readerWith([
      row('home_service.transport_fee_amount', null, 2000),
      row('home_service.transport_fee_amount', B3, 3000),
    ]);
    expect(await reader.effective(['home_service.transport_fee_amount'])).toStrictEqual({
      'home_service.transport_fee_amount': 2000,
    });
    expect(calls[0]?.branchId).toBeNull();
  });

  it('before the base seed (no company) answers the defaults and reads no row', async () => {
    const { reader, calls } = readerWith([], null);
    expect(await reader.effective(['booking.slot_interval_minutes'])).toStrictEqual({
      'booking.slot_interval_minutes': 15,
    });
    expect(calls).toStrictEqual([]);
  });

  it('returns copies, so a caller cannot change a default or a stored value', async () => {
    const { reader } = readerWith([]);
    const values = await reader.effective(['system.maintenance']);
    (values['system.maintenance'] as { enabled: boolean }).enabled = true;
    expect(await reader.effective(['system.maintenance'])).toStrictEqual({
      'system.maintenance': { enabled: false },
    });
  });

  it('keeps the company id once it is known, but never the null from before the base seed', async () => {
    const repository = { rowsOf: () => Promise.resolve([]) } as unknown as SettingsRepository;
    const ids: (string | null)[] = [null, COMPANY, 'another-company'];
    let lookups = 0;
    const company = new CompanyOfSettings();
    company.use(() => Promise.resolve(ids[lookups++] ?? null));
    const log = { error: () => undefined } as unknown as Logger;
    const reader = new StoreSettingsReader(repository, company, log);
    for (let read = 0; read < 4; read += 1) await reader.effective(['receipt.auto_print']);
    // null (no company yet) → looked up again → the company → kept for every later read.
    expect(lookups).toBe(2);
    expect(await company.id()).toBe(COMPANY);
  });

  it('does not keep a company id read inside a transaction, which might still roll back', async () => {
    let lookups = 0;
    const company = new CompanyOfSettings();
    company.use(() => {
      lookups += 1;
      return Promise.resolve(COMPANY);
    });
    await TransactionScope.run(TransactionScope.create(), () => company.id());
    await company.id();
    await company.id();
    expect(lookups).toBe(2);
  });

  it('the client-readable list of P1.SET.02 is the ten keys of settings.json, in file order', () => {
    expect(CLIENT_READABLE_KEYS).toStrictEqual([
      'booking.advance_window_days',
      'booking.slot_interval_minutes',
      'home_service.transport_fee_amount',
      'receipt.auto_print',
      'receipt.printer_width_mm',
      'sales.service_charge_enabled',
      'sales.tax_enabled',
      'closing.cash_difference_tolerance_amount',
      'system.default_language',
      'system.upload_max_mb',
    ]);
  });
});

// Review of PR #45: a row written by SQL (the restore runbook writes `system.maintenance` while the
// API is stopped — P8.BAK.03) is not checked by the write path. A value its key's schema refuses is
// ignored, as if the row were absent, and logged with the key and the issue — never the value.
describe('StoreSettingsReader — a stored value its key does not accept', () => {
  const ignored =
    'settings row with a value its key does not accept — ignored, the parent value applies';

  it('a malformed company value reads as the default; the log names the key and the issue only', async () => {
    const { reader, errors } = readerWith([
      row('receipt.printer_width_mm', null, 76),
      row('receipt.thank_you_text', null, { mm: '', en: 'Thank you' }),
    ]);
    expect(
      await reader.effective(['receipt.printer_width_mm', 'receipt.thank_you_text']),
    ).toStrictEqual({ 'receipt.printer_width_mm': 58, 'receipt.thank_you_text': null });
    expect(errors).toStrictEqual([
      {
        fields: { key: 'receipt.printer_width_mm', issues: [{ path: [], code: 'invalid_value' }] },
        message: ignored,
      },
      {
        fields: { key: 'receipt.thank_you_text', issues: [{ path: ['mm'], code: 'too_small' }] },
        message: ignored,
      },
    ]);
    expect(JSON.stringify(errors)).not.toContain('Thank you');
  });

  it('a malformed branch override reads as the company value', async () => {
    const { reader, errors } = readerWith([
      row('home_service.transport_fee_amount', null, 2000),
      row('home_service.transport_fee_amount', B3, '3000'),
    ]);
    expect(await reader.effective(['home_service.transport_fee_amount'], B3)).toStrictEqual({
      'home_service.transport_fee_amount': 2000,
    });
    expect(errors.map(({ fields }) => fields)).toStrictEqual([
      { key: 'home_service.transport_fee_amount', issues: [{ path: [], code: 'invalid_type' }] },
    ]);
  });

  it('a value the schema accepts is returned as stored, with nothing logged', async () => {
    const { reader, errors } = readerWith([
      row('system.maintenance', null, { enabled: true }),
      row('receipt.thank_you_text', null, { mm: 'ကျေးဇူးတင်ပါတယ်', en: null }),
    ]);
    expect(await reader.effective(['system.maintenance', 'receipt.thank_you_text'])).toStrictEqual({
      'system.maintenance': { enabled: true },
      'receipt.thank_you_text': { mm: 'ကျေးဇူးတင်ပါတယ်', en: null },
    });
    expect(errors).toStrictEqual([]);
  });
});

describe('the remaining seam (foundation task 2.12)', () => {
  it('nobody has a today branch until scheduling and attendance exist (Part 1 §12)', async () => {
    const today: TodayBranch = new NoTodayBranch();
    expect(await today.of('any-employee')).toBeNull();
  });
});
