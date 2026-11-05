import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { uuidV7 } from '../src/common/http/uuid-v7.js';
import { SettingsRepository } from '../src/modules/platform/repositories/settings.repository.js';
import { CompanyOfSettings, SettingBranches, UserNames } from '../src/modules/platform/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-settings-store tasks 2.2 – 2.3 — the ports people registers into platform at start-up (ADR-001
// rule 1 · design D1) and SettingsRepository on PostgreSQL (D-PLT-16 · DB Part 8 · P1.SET.04 · design
// D6 – D8): the upsert on the expression index `settings_scope_key_uq`, the history the trigger
// `settings_history_trg` writes, the reset update and the history page.
const { B1, B3 } = FIXTURE_IDS.branches;
const KYAW_ZIN = FIXTURE_IDS.users.E001;
const MA_HNIN = FIXTURE_IDS.users.E002;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
let repository: SettingsRepository;
let runner: TransactionRunner;
let companyId: string;

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T09:00:00'));
  repository = s.app.get(SettingsRepository);
  runner = s.app.get(TransactionRunner);
  companyId = (await s.prisma.companies.findFirstOrThrow()).id;
});
afterAll(() => s.close());

const write = (
  key: string,
  value: unknown,
  options: { branchId?: string; by?: string; at?: string } = {},
) => {
  const at = mmt(options.at ?? '2026-10-05T09:00:00');
  return runner.run((tx) =>
    repository.upsert(tx, {
      id: uuidV7(at.getTime()),
      company_id: companyId,
      branch_id: options.branchId ?? null,
      key,
      value,
      actor_user_id: options.by ?? KYAW_ZIN,
      at,
    }),
  );
};

const reset = (key: string, value: unknown, branchId: string | null, at: string) =>
  runner.run((tx) =>
    repository.resetTo(tx, {
      company_id: companyId,
      branch_id: branchId,
      key,
      value,
      actor_user_id: MA_HNIN,
      at: mmt(at),
    }),
  );

const historyOf = async (key: string, branchId: string | null) =>
  s.prisma.settings_history.findMany({
    where: { settings: { company_id: companyId, key, branch_id: branchId } },
    orderBy: [{ changed_at: 'asc' }, { id: 'asc' }],
  });

describe('the settings ports people registers at start-up (task 2.2)', () => {
  it('CompanyOfSettings is the fixture company; UserNames names U Kyaw Zin; B3 is a branch', async () => {
    expect(await s.app.get(CompanyOfSettings).id()).toBe(companyId);
    expect(await s.app.get(UserNames).of([KYAW_ZIN, KYAW_ZIN])).toStrictEqual(
      new Map([[KYAW_ZIN, { id: KYAW_ZIN, name_mm: 'ဦးကျော်ဇင်', name_en: 'U Kyaw Zin' }]]),
    );
    expect(await s.app.get(SettingBranches).exists(B3)).toBe(true);
    expect(await s.app.get(SettingBranches).exists(uuidV7(Date.now()))).toBe(false);
  });
});

describe('SettingsRepository (task 2.3 · design D6 – D8)', () => {
  it('the first write inserts; the trigger writes one history row with old_value null', async () => {
    const written = await write('booking.slot_interval_minutes', 30);
    expect(written).toMatchObject({ inserted: true });
    const rows = await s.prisma.settings.findMany({
      where: { key: 'booking.slot_interval_minutes' },
    });
    expect(rows).toMatchObject([
      {
        id: written?.id,
        company_id: companyId,
        branch_id: null,
        value: 30,
        updated_by_user_id: KYAW_ZIN,
        updated_at: mmt('2026-10-05T09:00:00'),
        created_at: mmt('2026-10-05T09:00:00'),
      },
    ]);
    expect(await historyOf('booking.slot_interval_minutes', null)).toMatchObject([
      { setting_id: written?.id, old_value: null, new_value: 30, changed_by_user_id: KYAW_ZIN },
    ]);
  });

  it('a second value updates the row and adds one history row', async () => {
    const written = await write('booking.slot_interval_minutes', 15, { at: '2026-10-05T09:05:00' });
    expect(written).toMatchObject({ inserted: false });
    expect(
      await s.prisma.settings.findMany({ where: { key: 'booking.slot_interval_minutes' } }),
    ).toMatchObject([{ value: 15, updated_at: mmt('2026-10-05T09:05:00') }]);
    expect(
      (await historyOf('booking.slot_interval_minutes', null)).map((row) => [
        row.old_value,
        row.new_value,
      ]),
    ).toStrictEqual([
      [null, 30],
      [30, 15],
    ]);
  });

  it('the same value returns no row and changes nothing — updated_at stays 9:05', async () => {
    expect(
      await write('booking.slot_interval_minutes', 15, { at: '2026-10-05T09:06:00' }),
    ).toBeNull();
    expect(
      await s.prisma.settings.findMany({ where: { key: 'booking.slot_interval_minutes' } }),
    ).toMatchObject([{ value: 15, updated_at: mmt('2026-10-05T09:05:00') }]);
    expect(await historyOf('booking.slot_interval_minutes', null)).toHaveLength(2);
  });

  it('a jsonb value with its members in another order is the same value', async () => {
    await write('receipt.thank_you_text', { mm: 'ကျေးဇူးတင်ပါတယ်', en: null });
    expect(await write('receipt.thank_you_text', { en: null, mm: 'ကျေးဇူးတင်ပါတယ်' })).toBeNull();
    expect(await historyOf('receipt.thank_you_text', null)).toHaveLength(1);
  });

  it('a company value and a branch override are two rows of one key (the COALESCE index)', async () => {
    await write('home_service.transport_fee_amount', 2000, { at: '2026-10-05T09:10:00' });
    await write('home_service.transport_fee_amount', 3000, {
      branchId: B3,
      by: MA_HNIN,
      at: '2026-10-05T09:20:00',
    });
    // Again for both: the conflict target finds each row — no unique violation, no new row.
    await write('home_service.transport_fee_amount', 2500, { at: '2026-10-05T09:30:00' });
    await write('home_service.transport_fee_amount', 3500, { branchId: B3, by: MA_HNIN });
    expect(
      (
        await s.prisma.settings.findMany({
          where: { key: 'home_service.transport_fee_amount' },
          orderBy: { branch_id: { sort: 'asc', nulls: 'first' } },
        })
      ).map((row) => [row.branch_id, row.value]),
    ).toStrictEqual([
      [null, 2500],
      [B3, 3500],
    ]);
  });

  it('rowsOf reads the company row and the asked branch only', async () => {
    await write('home_service.transport_fee_amount', 1000, { branchId: B1 });
    const rows = await repository.rowsOf(
      companyId,
      ['home_service.transport_fee_amount', 'booking.slot_interval_minutes'],
      B3,
    );
    expect(rows.map((row) => [row.key, row.branch_id, row.value]).sort()).toStrictEqual(
      [
        ['booking.slot_interval_minutes', null, 15],
        ['home_service.transport_fee_amount', null, 2500],
        ['home_service.transport_fee_amount', B3, 3500],
      ].sort(),
    );
    expect(
      (await repository.rowsOf(companyId, ['home_service.transport_fee_amount'], null)).map(
        (row) => row.branch_id,
      ),
    ).toStrictEqual([null]);
  });

  it('reset updates the row to the parent value and adds one history row; never inserts', async () => {
    expect(
      await reset('home_service.transport_fee_amount', 2500, B3, '2026-10-05T11:00:00'),
    ).not.toBeNull();
    expect(
      await s.prisma.settings.findFirstOrThrow({
        where: { key: 'home_service.transport_fee_amount', branch_id: B3 },
      }),
    ).toMatchObject({
      value: 2500,
      updated_by_user_id: MA_HNIN,
      updated_at: mmt('2026-10-05T11:00:00'),
    });
    expect(
      (await historyOf('home_service.transport_fee_amount', B3)).map((row) => [
        row.old_value,
        row.new_value,
        row.changed_by_user_id,
      ]),
    ).toStrictEqual([
      [null, 3000, MA_HNIN],
      [3000, 3500, MA_HNIN],
      [3500, 2500, MA_HNIN],
    ]);
    // Already the parent value, and a branch without a row: nothing written.
    expect(
      await reset('home_service.transport_fee_amount', 2500, B3, '2026-10-05T11:01:00'),
    ).toBeNull();
    expect(await reset('home_service.travel_minutes', 30, B1, '2026-10-05T11:01:00')).toBeNull();
    expect(await s.prisma.settings.count({ where: { key: 'home_service.travel_minutes' } })).toBe(
      0,
    );
  });

  it('the history page: newest first, keyset after the last item, the row of one branch only', async () => {
    const first = await repository.historyPage(
      companyId,
      'home_service.transport_fee_amount',
      B3,
      null,
      2,
    );
    expect(first.map((row) => row.new_value)).toStrictEqual([2500, 3500, 3000]);
    expect(first.every((row) => row.branch_id === B3)).toBe(true);
    const next = await repository.historyPage(
      companyId,
      'home_service.transport_fee_amount',
      B3,
      first[1]?.id ?? null,
      2,
    );
    expect(next.map((row) => row.new_value)).toStrictEqual([3000]);
    const company = await repository.historyPage(
      companyId,
      'home_service.transport_fee_amount',
      null,
      null,
      25,
    );
    expect(company.map((row) => [row.branch_id, row.new_value])).toStrictEqual([
      [null, 2500],
      [null, 2000],
    ]);
  });

  it('storedKeys lists every key that has a row', async () => {
    expect(await repository.storedKeys()).toStrictEqual([
      'booking.slot_interval_minutes',
      'home_service.transport_fee_amount',
      'receipt.thank_you_text',
    ]);
  });
});
