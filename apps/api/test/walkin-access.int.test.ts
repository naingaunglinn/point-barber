import { randomUUID } from 'node:crypto';

import { ErrorCode, VisitStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 6.8 / 6.9 — visits spec "Own visits need no code; acting on another
// barber's visit needs the visit codes" and sales-checkout spec "Own sale needs no code; … needs the
// sale codes" (P4-RULE-03 · API-PERM-02 / 03 · design D2), through the real guards: every route each
// actor-set resolver serves, for the performer Ko Aung, his colleague Ko Min, Ko Htet (Barber · B1),
// Ko Zaw (Manager · B1) and Ma Hnin (Manager · B3). Ko Aung's own Haircut is 10,000.
const { services } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';
const ZAW = 'E003';
const HNIN = 'E002';

let s: SeededApp;
let api: WalkinHttp;
let cash: string;
let v1: { visit: string; sale: string };
let v2: { visit: string; sale: string };
let v3: { visit: string; sale: string };

const forbidden = (required?: string) => ({
  code: ErrorCode.FORBIDDEN,
  ...(required === undefined ? {} : { context: { required } }),
});

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  api = walkinHttp(s);
  const prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  // Three STARTED visits first: once one is COMPLETED and unpaid, START is blocked (P4-RULE-02).
  const ids = async () => {
    const visit = await api.start(AUNG, [services.HAIRCUT]);
    return { visit: visit.id, sale: visit.sale.id };
  };
  v1 = await ids();
  v2 = await ids();
  v3 = await ids();
});
afterAll(() => s.close());

describe('reading a visit — sale.readers (a visit id) or visit.view⁺', () => {
  it('the performer reads his own visit without a code', async () => {
    const res = await api.get(AUNG, `/visits/${v1.visit}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: v1.visit, sale: { id: v1.sale } });
  });

  it('Scenario: A colleague of the same branch reads → 403 with context.required = visit.view', async () => {
    const res = await api.get(MIN, `/visits/${v1.visit}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('visit.view'));
  });

  // Waits for the owner (question of 20/Oct/2026): the foundation access spec answers a caller with no
  // code of the module 403 on a single read too; this scenario says 404.
  it.todo('Scenario: A barber of another branch reads → 404');

  it('a manager of another branch reads → 404 (a read outside the scope)', async () => {
    expect((await api.get(ZAW, `/visits/${v1.visit}`)).status).toBe(404);
  });

  it('Scenario: The branch manager reads → 200 with the visit and its sale', async () => {
    const res = await api.get(HNIN, `/visits/${v1.visit}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: v1.visit, sale: { id: v1.sale } });
  });
});

describe('reading a sale — sale.readers (a sale id) or sale.view⁺', () => {
  it('the performer reads his own sale; the branch manager reads it', async () => {
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).status).toBe(200);
    expect((await api.get(HNIN, `/sales/${v1.sale}`)).status).toBe(200);
  });

  // Waits for the owner (question of 20/Oct/2026): the seed Barber role holds sale.create and
  // sale.late_entry, so under sale.view⁺ every barber of B3 passes this read.
  it.todo('Scenario: A colleague of the same branch reads amounts → 403 sale.view');

  it('Scenario: A barber of another branch reads a B3 sale → 404', async () => {
    const res = await api.get(HTET, `/sales/${v1.sale}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('lines — visit.lineActors (a sale id) or visit.update', () => {
  it('the performer adds a line to his own sale', async () => {
    const res = await api.post(AUNG, `/sales/${v1.sale}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('Scenario: A colleague tries to add a line → 403 visit.update, no line added', async () => {
    const res = await api.post(MIN, `/sales/${v1.sale}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('visit.update'));
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).body.items).toHaveLength(2);
  });

  it('Ko Htet (no visit code) → 403 visit.update', async () => {
    const res = await api.post(HTET, `/sales/${v1.sale}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('visit.update'));
  });

  it('Scenario: A manager of another branch → 403 forbidden, no line added', async () => {
    const res = await api.post(ZAW, `/sales/${v1.sale}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).body.items).toHaveLength(2);
  });

  it('the branch manager adds a line; the performer and the manager remove lines, a colleague cannot', async () => {
    const added = await api.post(HNIN, `/sales/${v1.sale}/items`, {
      line_type: 1,
      service_id: services.HAIR_WASH,
    });
    expect(added.status).toBe(200);
    const [, shave, wash] = added.body.items as { id: string }[];
    const denied = await api.post(MIN, `/sales/${v1.sale}/items/${wash?.id}/remove`, {
      reason: 'Not done',
    });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject(forbidden('visit.update'));
    const byAung = await api.post(AUNG, `/sales/${v1.sale}/items/${wash?.id}/remove`, {
      reason: 'Not done',
    });
    expect(byAung.status).toBe(200);
    const byHnin = await api.post(HNIN, `/sales/${v1.sale}/items/${shave?.id}/remove`, {
      reason: 'Customer changed his mind',
    });
    expect(byHnin.status).toBe(200);
    expect(byHnin.body.total_amount).toBe(10_000);
  });
});

describe('COMPLETE — visit.lineActors (a visit id) or visit.update', () => {
  it('a colleague → 403 visit.update; a manager of another branch → 403; the performer → 200', async () => {
    const min = await api.post(MIN, `/visits/${v1.visit}/complete`);
    expect(min.status).toBe(403);
    expect(min.body).toMatchObject(forbidden('visit.update'));
    const zaw = await api.post(ZAW, `/visits/${v1.visit}/complete`);
    expect(zaw.status).toBe(403);
    expect(zaw.body.code).toBe(ErrorCode.FORBIDDEN);
    const aung = await api.post(AUNG, `/visits/${v1.visit}/complete`);
    expect(aung.status).toBe(200);
    expect(aung.body.status).toBe(VisitStatus.COMPLETED);
  });

  it("the branch manager completes the performer's visit", async () => {
    const res = await api.post(HNIN, `/visits/${v2.visit}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(VisitStatus.COMPLETED);
  });
});

describe('INCOMPLETE — visit.incompleteActors (a visit id) or visit.delete', () => {
  it('a colleague → 403 visit.delete; a manager of another branch → 403; the performer → 200', async () => {
    const body = { reason: 'Customer left' };
    const min = await api.post(MIN, `/visits/${v3.visit}/incomplete`, body);
    expect(min.status).toBe(403);
    expect(min.body).toMatchObject(forbidden('visit.delete'));
    const zaw = await api.post(ZAW, `/visits/${v3.visit}/incomplete`, body);
    expect(zaw.status).toBe(403);
    const aung = await api.post(AUNG, `/visits/${v3.visit}/incomplete`, body);
    expect(aung.status).toBe(200);
    expect(aung.body.status).toBe(VisitStatus.INCOMPLETE);
  });

  it('Scenario: The branch manager closes an abandoned visit → 200, incomplete_by = Ma Hnin', async () => {
    const res = await api.post(HNIN, `/visits/${v2.visit}/incomplete`, {
      reason: 'Barber left, customer did not pay',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(VisitStatus.INCOMPLETE);
    expect(res.body.incomplete_by).toMatchObject({ user_id: FIXTURE_IDS.users.E002 });
  });
});

describe('payments and FINISH — sale.checkoutActors (a sale id, a payment id) or sale.finish_override', () => {
  it('Scenario: A barber of another branch tries to take payment → 403 sale.finish_override, no row', async () => {
    for (const who of [HTET, MIN] as const) {
      const res = await api.post(
        who,
        `/sales/${v1.sale}/payments`,
        { payment_method_id: cash, amount: 10_000 },
        randomUUID(),
      );
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject(forbidden('sale.finish_override'));
    }
    const zaw = await api.post(
      ZAW,
      `/sales/${v1.sale}/payments`,
      { payment_method_id: cash, amount: 10_000 },
      randomUUID(),
    );
    expect(zaw.status).toBe(403);
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).body.payments).toHaveLength(0);
  });

  it('the performer and the branch manager take payment; void by payment id follows the same sets', async () => {
    const byAung = await api.pay(AUNG, v1.sale, { payment_method_id: cash, amount: 4_000 });
    const byHnin = await api.pay(HNIN, v1.sale, { payment_method_id: cash, amount: 6_000 });
    const [aungPayment] = byAung.payments;
    const hninPayment = byHnin.payments.find((p) => p.id !== aungPayment?.id);
    const min = await api.post(MIN, `/payments/${aungPayment?.id}/void`, {
      reason: 'Wrong amount',
    });
    expect(min.status).toBe(403);
    expect(min.body).toMatchObject(forbidden('sale.finish_override'));
    expect(
      (await api.post(AUNG, `/payments/${hninPayment?.id}/void`, { reason: 'Wrong amount' }))
        .status,
    ).toBe(200);
    expect(
      (await api.post(HNIN, `/payments/${aungPayment?.id}/void`, { reason: 'Wrong amount' }))
        .status,
    ).toBe(200);
    const sale = await api.pay(AUNG, v1.sale, { payment_method_id: cash, amount: 10_000 });
    expect(sale.remaining_amount).toBe(0);
  });

  it('FINISH: a colleague → 403; Scenario: Finish for an absent barber without a reason → 400', async () => {
    const min = await api.post(MIN, `/sales/${v1.sale}/finish`, { expected_total_amount: 10_000 });
    expect(min.status).toBe(403);
    expect(min.body).toMatchObject(forbidden('sale.finish_override'));
    const hnin = await api.post(HNIN, `/sales/${v1.sale}/finish`, {
      expected_total_amount: 10_000,
    });
    expect(hnin.status).toBe(400);
    expect(hnin.body.code).toBe(ErrorCode.REASON_REQUIRED);
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).body.status).toBe(1);
  });

  it('Scenario: Finish for an absent barber with a reason → 200, finished_by = Ma Hnin', async () => {
    const sale = await api.finish(HNIN, v1.sale, {
      expected_total_amount: 10_000,
      override_reason: 'Ko Aung went home',
    });
    expect(sale.finished_by).toMatchObject({ user_id: FIXTURE_IDS.users.E002 });
    expect(sale.items[0]?.performed_by).toMatchObject({ id: FIXTURE_IDS.employees.E004 });
  });
});

describe('an id that is not a UUID is a missing row, never a 500', () => {
  it('a holder gets 404 on the entity routes; a caller without the code gets 403', async () => {
    expect((await api.get(HNIN, '/visits/not-a-uuid')).status).toBe(404);
    expect((await api.get(HNIN, '/sales/not-a-uuid')).status).toBe(404);
    expect((await api.post(HNIN, '/sales/not-a-uuid/items', {})).status).toBe(404);
    expect((await api.post(HNIN, '/payments/not-a-uuid/void', {})).status).toBe(404);
    expect((await api.get(AUNG, '/visits/not-a-uuid')).status).toBe(403);
    expect((await api.get(AUNG, '/sales/not-a-uuid/receipt')).status).toBe(404);
    expect((await api.get(AUNG, '/me/requests/not-a-uuid')).status).toBe(404);
  });
});
