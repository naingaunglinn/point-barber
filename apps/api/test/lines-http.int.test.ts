import { ErrorCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 6.13 – 6.15 — visits spec "Service lines are priced by the server" and
// "Removing a line, or adding one after COMPLETE, needs a reason" through POST /v1/sales/{id}/items and
// …/items/{item_id}/remove (P4.SAL.04 / .06 · D-VIS-05 · D-DAT-05 · API-DATA-02 / 11). 05/Oct/2026 at
// B3: Ko Min's Haircut 8,000, Shave 3,000, Hair wash 2,000; Ko Aung's own Haircut 10,000.
const { services, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';

let s: SeededApp;
let api: WalkinHttp;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:10:00+06:30'));
  api = walkinHttp(s);
});
afterAll(() => s.close());

interface Line {
  readonly id: string;
  readonly service_id: string;
  readonly unit_price_amount: number;
  readonly removed_at: string | null;
}
const add = (who: 'E004' | 'E005', saleId: string, body: object) =>
  api.post(who, `/sales/${saleId}/items`, { line_type: 1, ...body });
const lineOf = (lines: readonly Line[], serviceId: string) =>
  lines.find((line) => line.service_id === serviceId && line.removed_at === null);

describe('the server prices each line (P4.SAL.04)', () => {
  it('Scenarios: Branch price for Ko Min; Second service; A price sent by the client has no effect', async () => {
    const visit = await api.start(MIN, []);
    const first = await add(MIN, visit.sale.id, {
      service_id: services.HAIRCUT,
      unit_price_amount: 1,
      list_price_amount: 1,
      total_amount: 1,
    });
    expect(first.status).toBe(200);
    expect(first.body.items[0]).toMatchObject({
      list_price_amount: 8_000,
      unit_price_amount: 8_000,
      quantity: 1,
      performed_by: { id: FIXTURE_IDS.employees.E005 },
      description_en: 'Haircut',
    });
    expect(first.body.warnings).toStrictEqual([]);
    const second = await add(MIN, visit.sale.id, { service_id: services.SHAVE });
    expect(second.status).toBe(200);
    expect(lineOf(second.body.items, services.SHAVE)?.unit_price_amount).toBe(3_000);
    expect(second.body).toMatchObject({ subtotal_amount: 11_000, total_amount: 11_000 });
  });

  it('Scenario: Barber price for Ko Aung — 10,000', async () => {
    const visit = await api.start(AUNG, []);
    const res = await add(AUNG, visit.sale.id, { service_id: services.HAIRCUT });
    expect(res.status).toBe(200);
    expect(res.body.items[0].unit_price_amount).toBe(10_000);
  });
});

describe('removing a line keeps the row and needs a reason (P4.SAL.06)', () => {
  let saleId: string;
  let wash: Line | undefined;

  it('Scenario: Remove a line with a reason — the row stays, total 13,000 (10,000 + 3,000)', async () => {
    const visit = await api.start(AUNG, [services.HAIRCUT, services.SHAVE, services.HAIR_WASH]);
    saleId = visit.sale.id;
    expect(visit.sale.total_amount).toBe(15_000);
    wash = lineOf(visit.sale.items as Line[], services.HAIR_WASH);
    const res = await api.post(AUNG, `/sales/${saleId}/items/${wash?.id}/remove`, {
      reason: 'Customer changed his mind',
    });
    expect(res.status).toBe(200);
    expect(res.body.total_amount).toBe(13_000);
    const row = (res.body.items as Line[]).find((line) => line.id === wash?.id);
    expect(row).toMatchObject({
      removed_at: '2026-10-05T10:10:00+06:30',
      removed_by: { user_id: users.E004 },
      removed_reason: 'Customer changed his mind',
    });
  });

  it('Scenario: Remove without a reason — 400 reason_required, the line stays active', async () => {
    const shave = lineOf((await api.get(AUNG, `/sales/${saleId}`)).body.items, services.SHAVE);
    const res = await api.post(AUNG, `/sales/${saleId}/items/${shave?.id}/remove`, { reason: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    expect(
      lineOf((await api.get(AUNG, `/sales/${saleId}`)).body.items, services.SHAVE),
    ).toBeDefined();
  });

  it('Scenarios: Reason at the length limit — 200, stored unchanged; one character too long — 400 validation', async () => {
    const shave = lineOf((await api.get(AUNG, `/sales/${saleId}`)).body.items, services.SHAVE);
    const tooLong = await api.post(AUNG, `/sales/${saleId}/items/${shave?.id}/remove`, {
      reason: 'x'.repeat(1001),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'reason' }],
    });
    expect(
      lineOf((await api.get(AUNG, `/sales/${saleId}`)).body.items, services.SHAVE),
    ).toBeDefined();
    const reason = 'r'.repeat(1000);
    const atLimit = await api.post(AUNG, `/sales/${saleId}/items/${shave?.id}/remove`, { reason });
    expect(atLimit.status).toBe(200);
    expect((atLimit.body.items as Line[]).find((line) => line.id === shave?.id)).toMatchObject({
      removed_reason: reason,
    });
    expect(atLimit.body.total_amount).toBe(10_000);
  });
});

describe('a line after COMPLETE (D-VIS-05)', () => {
  let visitId: string;
  let saleId: string;

  it('Scenario: The last service of a completed visit cannot be removed — 422 service_required', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    visitId = visit.id;
    saleId = visit.sale.id;
    await api.complete(MIN, visitId);
    const [haircut] = visit.sale.items;
    const res = await api.post(MIN, `/sales/${saleId}/items/${haircut?.id}/remove`, {
      reason: 'Wrong service',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.SERVICE_REQUIRED);
    expect(
      lineOf((await api.get(MIN, `/sales/${saleId}`)).body.items, services.HAIRCUT),
    ).toBeDefined();
  });

  it('Scenario: Service added after COMPLETE without a reason — 400 reason_required, total stays 8,000', async () => {
    const res = await add(MIN, saleId, { service_id: services.SHAVE });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    expect((await api.get(MIN, `/sales/${saleId}`)).body.total_amount).toBe(8_000);
  });

  it('Scenario: Service added after "Service done" — 200, the reason stored, total 11,000 (8,000 + 3,000)', async () => {
    const res = await add(MIN, saleId, {
      service_id: services.SHAVE,
      added_reason: 'Customer asked for a shave at the counter',
    });
    expect(res.status).toBe(200);
    expect(lineOf(res.body.items, services.SHAVE)).toMatchObject({
      added_reason: 'Customer asked for a shave at the counter',
    });
    expect(res.body.total_amount).toBe(11_000);
  });
});
