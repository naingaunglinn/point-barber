import { randomUUID } from 'node:crypto';

import { LocationType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { PriceRows } from '../src/modules/catalog/price-rows/price-rows.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-service-catalogue task 5.4 — `PriceRows.closeAsOfToday` (services-pricing spec "Archive and un-sell close
// the price rows as of today" · P2-RULE-04 #5 · D-SVC-08 · design D6), the function the archive and the branch
// sale call. Monday 05/Oct/2026 10:00 AM MMT, so today is 2026-10-05. The fixture rows: Haircut 8,000 at B3 and
// Ko Aung's 10,000, 6,000 at B1, 7,000 at B2, all from 2026-09-01 and open; Shave 3,000 at B1 – B3.
const { branches, services, employees } = FIXTURE_IDS;
const NOW = new Date('2026-10-05T10:00:00+06:30');
const TODAY = '2026-10-05';

let t: SeededApp;
let prices: PriceRows;
let runner: TransactionRunner;
const added: string[] = [];

beforeAll(async () => {
  t = await startSeededApp({ now: NOW });
  prices = t.app.get(PriceRows);
  runner = t.app.get(TransactionRunner);
});
afterAll(() => t.close());
afterEach(async () => {
  await t.prisma.service_prices.deleteMany({ where: { id: { in: added } } });
  added.length = 0;
  await t.prisma.service_prices.updateMany({
    where: { service_id: { in: [services.HAIRCUT, services.SHAVE] } },
    data: { effective_to: null, archived_at: null },
  });
});

const day = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));
const close = (service_id: string, branch_id?: string) =>
  runner.run((tx) =>
    prices.closeAsOfToday(
      tx,
      branch_id === undefined ? { service_id } : { service_id, branch_id },
      TODAY,
      NOW,
    ),
  );
const row = (id: string) => t.prisma.service_prices.findUniqueOrThrow({ where: { id } });
const fixtureRow = (service_id: string, branch_id: string, employee_id: string | null) =>
  t.prisma.service_prices.findFirstOrThrow({ where: { service_id, branch_id, employee_id } });
async function addRow(branch_id: string, amount: number, from: string): Promise<string> {
  const id = randomUUID();
  await t.prisma.service_prices.create({
    data: {
      id,
      branch_id,
      service_id: services.HAIRCUT,
      location_type: LocationType.BRANCH,
      price_amount: BigInt(amount),
      effective_from: new Date(`${from}T00:00:00Z`),
    },
  });
  added.push(id);
  return id;
}

describe('PriceRows.closeAsOfToday (task 5.4 · P2-RULE-04 #5 · D-SVC-08)', () => {
  it('Scenario: The open rows end today — the B3 branch row and Ko Aung’s row get effective_to 2026-10-05', async () => {
    const branchRow = await fixtureRow(services.HAIRCUT, branches.B3, null);
    const barberRow = await fixtureRow(services.HAIRCUT, branches.B3, employees.E004);
    const closed = await close(services.HAIRCUT, branches.B3);
    expect([...closed.ended].sort()).toStrictEqual([branchRow.id, barberRow.id].sort());
    expect(closed.archived).toStrictEqual([]);
    for (const id of [branchRow.id, barberRow.id]) {
      const after = await row(id);
      expect([day(after.effective_to), after.archived_at]).toStrictEqual([TODAY, null]);
      expect(after.updated_at).toStrictEqual(NOW);
    }
  });

  it('Scenario: A scheduled price is withdrawn — 8,000 to 05/Oct keeps its end, 9,000 from 06/Oct is archived', async () => {
    const current = await fixtureRow(services.HAIRCUT, branches.B3, null);
    await t.prisma.service_prices.update({
      where: { id: current.id },
      data: { effective_to: new Date('2026-10-05T00:00:00Z') },
    });
    const scheduled = await addRow(branches.B3, 9_000, '2026-10-06');
    const before = await row(current.id);
    const closed = await close(services.HAIRCUT, branches.B3);
    expect(closed.archived).toStrictEqual([scheduled]);
    expect(closed.ended).not.toContain(current.id);
    expect((await row(scheduled)).archived_at).toStrictEqual(NOW);
    expect(await row(current.id)).toStrictEqual(before);
  });

  it('Scenario: A price that started today — 8,500 is archived and the ended 8,000 row is unchanged', async () => {
    const current = await fixtureRow(services.HAIRCUT, branches.B3, null);
    await t.prisma.service_prices.update({
      where: { id: current.id },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const today = await addRow(branches.B3, 8_500, TODAY);
    const before = await row(current.id);
    const closed = await close(services.HAIRCUT, branches.B3);
    expect(closed.archived).toStrictEqual([today]);
    expect((await row(today)).archived_at).toStrictEqual(NOW);
    expect(await row(current.id)).toStrictEqual(before);
  });

  it('Scenario: Other branches keep their prices — B1 and B2 stay open', async () => {
    await close(services.HAIRCUT, branches.B3);
    for (const branch of [branches.B1, branches.B2]) {
      const other = await fixtureRow(services.HAIRCUT, branch, null);
      expect([other.effective_to, other.archived_at]).toStrictEqual([null, null]);
    }
  });

  it('Scenario: Archive closes every branch — Shave B1, B2 and B3 end on 2026-10-05', async () => {
    const closed = await close(services.SHAVE);
    expect(closed.ended).toHaveLength(3);
    const rows = await t.prisma.service_prices.findMany({ where: { service_id: services.SHAVE } });
    expect(rows.map((price) => day(price.effective_to))).toStrictEqual([TODAY, TODAY, TODAY]);
  });

  it('a second call changes nothing and reports nothing; no row is ever deleted', async () => {
    const count = await t.prisma.service_prices.count({ where: { service_id: services.HAIRCUT } });
    await close(services.HAIRCUT);
    const again = await close(services.HAIRCUT);
    expect(again).toStrictEqual({ archived: [], ended: [] });
    expect(await t.prisma.service_prices.count({ where: { service_id: services.HAIRCUT } })).toBe(
      count,
    );
  });
});
