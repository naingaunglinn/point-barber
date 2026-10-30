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
// actor-set resolver serves, for the performer Ko Aung, the colleague Ko Min, Ko Htet (Barber · B1),
// Ko Zaw (Manager · B1) and Ma Hnin (Manager · B3). Ko Aung's own Haircut is 10,000.
const { services } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';
const ZAW = 'E003';
const HNIN = 'E002';

let s: SeededApp;
let api: WalkinHttp;
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
  it('the performer reads their own visit without a code', async () => {
    const res = await api.get(AUNG, `/visits/${v1.visit}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: v1.visit, sale: { id: v1.sale } });
  });

  it('Scenario: A colleague of the same branch reads → 403 with context.required = visit.view', async () => {
    const res = await api.get(MIN, `/visits/${v1.visit}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('visit.view'));
  });

  it('Scenario: A barber of another branch reads (no visit code) → 403 with context.required = visit.view', async () => {
    const res = await api.get(HTET, `/visits/${v1.visit}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('visit.view'));
  });

  it('Scenario: A manager of another branch reads → 404', async () => {
    expect((await api.get(ZAW, `/visits/${v1.visit}`)).status).toBe(404);
  });

  it('Scenario: The branch manager reads → 200 with the visit and its sale', async () => {
    const res = await api.get(HNIN, `/visits/${v1.visit}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: v1.visit, sale: { id: v1.sale } });
  });
});

describe('reading a sale — sale.readers (a sale id) or sale.view itself (Part 4 v1.3)', () => {
  it('the performer reads their own sale; the branch manager reads it', async () => {
    expect((await api.get(AUNG, `/sales/${v1.sale}`)).status).toBe(200);
    expect((await api.get(HNIN, `/sales/${v1.sale}`)).status).toBe(200);
  });

  it('Scenario: A colleague of the same branch reads amounts → 403 with context.required = sale.view', async () => {
    // Ko Min holds sale.create and sale.late_entry at B3; they open no one else's sale (Part 4 v1.3).
    const res = await api.get(MIN, `/sales/${v1.sale}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('sale.view'));
  });

  it('Scenario: A barber of another branch reads a B3 sale → 403 with context.required = sale.view', async () => {
    const res = await api.get(HTET, `/sales/${v1.sale}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(forbidden('sale.view'));
  });

  it('Scenario: A manager of another branch reads a B3 sale → 404', async () => {
    const res = await api.get(ZAW, `/sales/${v1.sale}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('lines — visit.lineActors (a sale id) or visit.update', () => {
  it('the performer adds a line to their own sale', async () => {
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

describe('an id that is not a UUID is a missing row, never a 500', () => {
  it('a holder gets 404 on the entity routes; a caller without the code gets 403', async () => {
    expect((await api.get(HNIN, '/visits/not-a-uuid')).status).toBe(404);
    expect((await api.get(HNIN, '/sales/not-a-uuid')).status).toBe(404);
    expect((await api.post(HNIN, '/sales/not-a-uuid/items', {})).status).toBe(404);
    expect((await api.get(AUNG, '/visits/not-a-uuid')).status).toBe(403);
    expect((await api.get(AUNG, '/me/requests/not-a-uuid')).status).toBe(404);
  });
});
