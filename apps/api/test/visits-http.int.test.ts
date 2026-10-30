import { randomUUID } from 'node:crypto';

import {
  AuditSource,
  DailyClosingStatus,
  ErrorCode,
  SaleStatus,
  VisitStatus,
  saleSchema,
  visitSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 6.6, 6.10, 6.11, 6.16 – 6.19 — visits spec "Today lists the barber's
// open visits first", "START is idempotent", "A completed, unpaid visit blocks the next START",
// "COMPLETE needs at least one service", "INCOMPLETE closes a visit that will not be paid" and "Was it
// saved?", through the HTTP endpoints and the guards (P4.VIS.02 – .06 · P4.REQ.01 · API-IDEM-01 / 02 ·
// API-AUD-01). Monday 05/Oct/2026 at B3, the clock moved by each scenario; Ko Aung's Haircut is 10,000.
const { branches, services, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const KYAW_ZIN = 'E001';
const at = (local: string) => s.clock?.set(new Date(`2026-10-05T${local}+06:30`));

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:00:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
});
afterAll(() => s.close());

const appAudits = (action: string, entityId: string) =>
  prisma.audit_events.count({ where: { action, entity_id: entityId, source: AuditSource.APP } });
const startBody = (branch: string = branches.B3, items: string[] = [services.HAIRCUT]) => ({
  branch_id: branch,
  items: items.map((service_id) => ({ service_id })),
});

describe("Today lists the barber's open visits first (P4.VIS.02)", () => {
  let a: string;
  let b: string;

  it('Scenario: No open visit — Ko Min gets { items: [] }', async () => {
    const res = await api.get(MIN, '/me/visits?status=1&status=2');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ items: [] });
  });

  it('Scenario: Two open visits, oldest first — A STARTED 9:20, B COMPLETED 10:00', async () => {
    at('09:20:00');
    a = (await api.start(AUNG, [services.HAIRCUT])).id;
    at('09:40:00');
    b = (await api.start(AUNG, [services.SHAVE])).id;
    at('10:00:00');
    await api.complete(AUNG, b);
    at('10:05:00');
    const res = await api.get(AUNG, '/me/visits?status=1&status=2');
    expect(res.status).toBe(200);
    expect(
      (res.body.items as { id: string; status: number }[]).map((v) => [v.id, v.status]),
    ).toStrictEqual([
      [a, VisitStatus.STARTED],
      [b, VisitStatus.COMPLETED],
    ]);
    for (const item of res.body.items as unknown[]) expect(visitSchema.parse(item)).toBeDefined();
  });

  it("Scenario: A colleague's visit is not listed", async () => {
    const res = await api.get(MIN, '/me/visits?status=1&status=2');
    expect(res.status).toBe(200);
    expect((res.body.items as { id: string }[]).map((v) => v.id)).not.toContain(a);
  });

  it('Scenario: Awaiting payment blocks the next customer — 422 unpaid_visit_open with visit B', async () => {
    const res = await api.post(AUNG, '/visits', startBody(), randomUUID());
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: ErrorCode.UNPAID_VISIT_OPEN,
      context: { visit_id: b },
    });
  });

  it('Scenario: Unblocked after INCOMPLETE — the sale CANCELLED, the next START 201', async () => {
    const res = await api.post(AUNG, `/visits/${b}/incomplete`, {
      reason: 'Customer left without paying',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: VisitStatus.INCOMPLETE,
      sale: { status: SaleStatus.CANCELLED, receipt_number: null },
    });
    expect((await api.post(AUNG, '/visits', startBody(), randomUUID())).status).toBe(201);
  });

  it("the default list adds today's INCOMPLETE visit; a status and date filter narrows it", async () => {
    const all = await api.get(AUNG, '/me/visits');
    expect((all.body.items as { id: string }[]).map((v) => v.id)).toContain(b);
    const open = await api.get(AUNG, '/me/visits?status=1&status=2');
    expect((open.body.items as { id: string }[]).map((v) => v.id)).not.toContain(b);
    const closed = await api.get(AUNG, '/me/visits?status=0&date=2026-10-05');
    expect((closed.body.items as { id: string }[]).map((v) => v.id)).toStrictEqual([b]);
    expect((await api.get(AUNG, '/me/visits?status=7')).status).toBe(400);
  });
});

describe('START is idempotent on its Idempotency-Key (API-IDEM-01 / 02)', () => {
  it('Scenario: Key missing — 400 idempotency_key_required', async () => {
    const res = await api.post(MIN, '/visits', startBody());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REQUIRED);
  });

  it('Scenario: Second request while the first is still running — 409, then one visit and one sale', async () => {
    const key = randomUUID();
    await prisma.$transaction(async (tx) => {
      // The first request's try-lock on the key, held inside its transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`idem:${key}`}, 0))`;
      const second = await api.post(MIN, '/visits', startBody(), key);
      expect(second.status).toBe(409);
      expect(second.body.code).toBe(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
    });
    expect((await api.post(MIN, '/visits', startBody(), key)).status).toBe(201);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
    expect(await prisma.sales.count({ where: { client_request_id: key } })).toBe(1);
  });

  it('Scenarios: Double tap, lost reply — 200 Idempotent-Replayed, the same visit, one audit row', async () => {
    at('10:05:00');
    const key = randomUUID();
    const first = await api.post(MIN, '/visits', startBody(), key);
    expect(first.status).toBe(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    at('10:05:30');
    const again = await api.post(MIN, '/visits', startBody(), key);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toMatchObject({
      id: first.body.id,
      started_at: '2026-10-05T10:05:00+06:30',
    });
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
    expect(await prisma.sales.count({ where: { client_request_id: key } })).toBe(1);
    expect(await appAudits('visit.start', first.body.id as string)).toBe(1);
  });

  it('Scenario: Same key, different branch — 422 idempotency_mismatch, nothing at B1', async () => {
    const key = randomUUID();
    expect((await api.post(KYAW_ZIN, '/visits', startBody(branches.B3), key)).status).toBe(201);
    const other = await api.post(KYAW_ZIN, '/visits', startBody(branches.B1), key);
    expect(other.status).toBe(422);
    expect(other.body.code).toBe(ErrorCode.IDEMPOTENCY_MISMATCH);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
  });
});

describe('the visit and the sale as the screens read them (P4.VIS.04 · P4.SAL.02)', () => {
  it('GET /v1/visits/{id} and GET /v1/sales/{id} answer the Visit and Sale shapes', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    const read = await api.get(MIN, `/visits/${visit.id}`);
    expect(read.status).toBe(200);
    const parsed = visitSchema.parse(read.body);
    expect(parsed.sale).toMatchObject({
      status: SaleStatus.OPEN,
      total_amount: 8_000,
      paid_amount: 0,
      remaining_amount: 8_000,
      payments: [],
      refunds: [],
      commission_estimate: null,
    });
    const sale = await api.get(MIN, `/sales/${visit.sale.id}`);
    expect(sale.status).toBe(200);
    expect(saleSchema.parse(sale.body)).toMatchObject({
      id: visit.sale.id,
      visit_id: visit.id,
      items: [{ service_id: services.HAIRCUT, unit_price_amount: 8_000 }],
      actions: { edit_lines: true, take_payment: true, finish: false, mark_incomplete: true },
    });
  });
});

describe('COMPLETE needs at least one service (P4.VIS.05)', () => {
  it('Scenario: No service yet — 422 service_required, the visit stays 1 STARTED', async () => {
    const visit = await api.start(MIN, []);
    const res = await api.post(MIN, `/visits/${visit.id}/complete`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.SERVICE_REQUIRED);
    expect((await api.get(MIN, `/visits/${visit.id}`)).body.status).toBe(VisitStatus.STARTED);
  });

  it('Scenario: Only a removed line — 422 service_required', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    const [line] = visit.sale.items;
    const removed = await api.post(MIN, `/sales/${visit.sale.id}/items/${line?.id}/remove`, {
      reason: 'Wrong service',
    });
    expect(removed.status).toBe(200);
    const res = await api.post(MIN, `/visits/${visit.id}/complete`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.SERVICE_REQUIRED);
  });

  it('Scenarios: Service done at 10:40; Repeat at 10:41 — 200, completed_at unchanged, one audit row', async () => {
    at('10:05:00');
    const visit = await api.start(KYAW_ZIN, [services.HAIRCUT]);
    at('10:40:00');
    const done = await api.complete(KYAW_ZIN, visit.id);
    expect(done).toMatchObject({
      status: VisitStatus.COMPLETED,
      completed_at: '2026-10-05T10:40:00+06:30',
      completed_by: { user_id: users.E001 },
    });
    at('10:41:00');
    const again = await api.complete(KYAW_ZIN, visit.id);
    expect(again.completed_at).toBe('2026-10-05T10:40:00+06:30');
    expect(await appAudits('visit.complete', visit.id)).toBe(1);
  });
});

describe('INCOMPLETE closes a visit that will not be paid (P4.VIS.06)', () => {
  it('Scenario: No reason — 400 reason_required for "" and for a missing reason', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    for (const body of [{ reason: '' }, {}]) {
      const res = await api.post(MIN, `/visits/${visit.id}/incomplete`, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    }
  });

  it('Scenario: Started by mistake — visit 0, sale 0 with cancelled_at, no number; repeat 200, one audit row', async () => {
    at('10:05:00');
    const visit = await api.start(MIN, [services.HAIRCUT]);
    at('10:06:00');
    const res = await api.post(MIN, `/visits/${visit.id}/incomplete`, {
      reason: 'Started by mistake',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: VisitStatus.INCOMPLETE,
      incomplete_reason: 'Started by mistake',
      sale: {
        status: SaleStatus.CANCELLED,
        cancelled_at: '2026-10-05T10:06:00+06:30',
        receipt_number: null,
      },
    });
    const open = await api.get(MIN, '/me/visits?status=1&status=2');
    expect((open.body.items as { id: string }[]).map((v) => v.id)).not.toContain(visit.id);
    const again = await api.post(MIN, `/visits/${visit.id}/incomplete`, { reason: 'Again' });
    expect(again.status).toBe(200);
    expect(again.body.incomplete_reason).toBe('Started by mistake');
    expect(await appAudits('visit.incomplete', visit.id)).toBe(1);
  });

  it('Scenarios: A finished visit cannot be marked incomplete or completed again; No receipt number is consumed', async () => {
    const finished = await api.start(AUNG, [services.HAIRCUT]);
    await api.complete(AUNG, finished.id);
    await api.pay(AUNG, finished.sale.id, { payment_method_id: cash, amount: 10_000 });
    const sale = await api.finish(AUNG, finished.sale.id, { expected_total_amount: 10_000 });
    expect(sale.receipt_number).toBe('B3-2026-OCT-00001');
    for (const action of ['incomplete', 'complete']) {
      const res = await api.post(AUNG, `/visits/${finished.id}/${action}`, { reason: 'Late' });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: ErrorCode.INVALID_TRANSITION,
        context: { status: VisitStatus.FINISHED },
      });
    }
    const dropped = await api.start(AUNG, [services.HAIRCUT]);
    await api.post(AUNG, `/visits/${dropped.id}/incomplete`, { reason: 'Customer left' });
    const next = await api.start(AUNG, [services.HAIRCUT]);
    await api.complete(AUNG, next.id);
    await api.pay(AUNG, next.sale.id, { payment_method_id: cash, amount: 10_000 });
    const second = await api.finish(AUNG, next.sale.id, { expected_total_amount: 10_000 });
    expect(second.receipt_number).toBe('B3-2026-OCT-00002');
  });
});

describe('"Was it saved?" is answered by the client request id (P4.REQ.01)', () => {
  it("Scenarios: START was saved, the reply was lost; Someone else's key; nothing saved", async () => {
    const key = randomUUID();
    const started = await api.post(MIN, '/visits', startBody(), key);
    expect(started.status).toBe(201);
    const found = await api.get(MIN, `/me/requests/${key}`);
    expect(found.status).toBe(200);
    expect(found.body).toStrictEqual({
      client_request_id: key,
      resource_type: 'visit',
      id: started.body.id,
      sale_id: started.body.sale.id,
      visit_id: null,
    });
    expect((await api.get(AUNG, `/me/requests/${key}`)).status).toBe(404);
    const missing = await api.get(MIN, `/me/requests/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('the visit and line actions are audited once (API-AUD-01 · P4-RULE-21)', () => {
  it('one app row per action and none for a repeat; trigger rows on sales and sale_items', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    const saleId = visit.sale.id;
    const added = await api.post(MIN, `/sales/${saleId}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect(added.status).toBe(200);
    const shave = (added.body.items as { id: string; service_id: string }[]).find(
      (line) => line.service_id === services.SHAVE,
    );
    for (let i = 0; i < 2; i += 1) {
      const res = await api.post(MIN, `/sales/${saleId}/items/${shave?.id}/remove`, {
        reason: 'Not done',
      });
      expect(res.status).toBe(200);
    }
    await api.complete(MIN, visit.id);
    await api.complete(MIN, visit.id);
    for (let i = 0; i < 2; i += 1) {
      await api.post(MIN, `/visits/${visit.id}/incomplete`, { reason: 'Customer left' });
    }
    expect(await appAudits('visit.start', visit.id)).toBe(1);
    expect(await appAudits('sale.item_add', saleId)).toBe(1);
    expect(await appAudits('sale.item_remove', saleId)).toBe(1);
    expect(await appAudits('visit.complete', visit.id)).toBe(1);
    expect(await appAudits('visit.incomplete', visit.id)).toBe(1);
    const triggers = await prisma.audit_events.groupBy({
      by: ['entity_type'],
      where: {
        source: AuditSource.DB_TRIGGER,
        OR: [{ entity_id: saleId }, { entity_id: shave?.id ?? '' }],
      },
    });
    expect(triggers.map((row) => row.entity_type).sort()).toStrictEqual(['sale_items', 'sales']);
  });
});

describe('INCOMPLETE takes no day lock (P4-RULE-11 · P7-RULE-02)', () => {
  // Last in the file: the closed day refuses every later START at B3.
  it('a visit of a closed day is still marked incomplete — 200', async () => {
    const visit = await api.start(MIN, [services.HAIRCUT]);
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date('2026-10-05T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-05T21:05:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const res = await api.post(MIN, `/visits/${visit.id}/incomplete`, { reason: 'Customer left' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(VisitStatus.INCOMPLETE);
  });
});
