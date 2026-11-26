import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  LateEntryReason,
  PayrollRunStatus,
  ProxyReason,
  VisitStatus,
  visitSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-proxy-recording tasks 2.1 and 2.3 — visits spec "START for another barber records the performer,
// the recorder and the proxy reason", "The unpaid block of a START is the performer's, never the
// recorder's" and "START is idempotent on its Idempotency-Key" (P4.VIS.03 · P4-RULE-02 #2 / 13 / 22 ·
// D-VIS-04 / 07 / 12 · owner PY-A = A), through POST /v1/visits and the guards. The clock is fixed at
// 05/Oct/2026 10:05 AM MMT (CG-TIME-03). Ko Min is E005, Ko Aung E004, Ko Htet E006 (B1), Ko Naing E009.
const { branches, services, employees, users } = FIXTURE_IDS;
const NOW = '2026-10-05T10:05:00+06:30';
const AUNG = 'E004';
const MIN = 'E005';
const HNIN = 'E002';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;

beforeAll(async () => {
  s = await seededApp(new Date(NOW));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
});
afterAll(() => s.close());

const proxyBody = (performer: string, reason: unknown, extra: object = {}) => ({
  branch_id: branches.B3,
  performed_by_employee_id: performer,
  proxy_reason: reason,
  ...extra,
});
const post = (who: 'E002' | 'E004' | 'E005' | 'E006', body: object, key: string = randomUUID()) =>
  api.post(who, '/visits', body, key);
const rows = async () => ({
  visits: await prisma.visits.count(),
  sales: await prisma.sales.count(),
});

describe('START for another barber (task 2.1 · P4-RULE-02 #2 · D-VIS-04 / 12)', () => {
  it('Scenario: Ko Min records Ko Aung walk-in because the phone is not available — both lists show it', async () => {
    const res = await post(MIN, proxyBody(employees.E004, ProxyReason.PHONE_UNAVAILABLE));
    expect(res.status).toBe(201);
    const visit = visitSchema.parse(res.body);
    expect(visit).toMatchObject({
      status: VisitStatus.STARTED,
      performed_by: { id: employees.E004 },
      started_by: { user_id: users.E005 },
      proxy_reason: ProxyReason.PHONE_UNAVAILABLE,
      is_late_entry: false,
      location_type: 1,
      business_date: '2026-10-05',
      started_at: NOW,
    });
    const row = await prisma.visits.findUniqueOrThrow({ where: { id: visit.id } });
    expect([row.performed_by_employee_id, row.started_by_user_id, row.proxy_reason]).toStrictEqual([
      employees.E004,
      users.E005,
      1,
    ]);
    for (const who of [AUNG, MIN] as const) {
      const mine = await api.get(who, '/me/visits?status=1&status=2');
      expect(mine.status).toBe(200);
      expect((mine.body.items as { id: string }[]).map((item) => item.id)).toContain(visit.id);
    }
  });

  it('Scenario: Helping record — Haircut is priced for Ko Aung (10,000, not Ko Min 8,000)', async () => {
    const res = await post(
      MIN,
      proxyBody(employees.E004, ProxyReason.OTHER, { items: [{ service_id: services.HAIRCUT }] }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      proxy_reason: ProxyReason.OTHER,
      sale: { total_amount: 10_000 },
    });
    expect(
      res.body.sale.items.map((item: { performed_by: { id: string }; unit_price_amount: number }) => [
        item.performed_by.id,
        item.unit_price_amount,
      ]),
    ).toStrictEqual([[employees.E004, 10_000]]);
  });

  it('Scenario: Another barber without a reason — 400 reason_required, nothing written', async () => {
    const before = await rows();
    for (const reason of [undefined, null]) {
      const res = await post(MIN, proxyBody(employees.E004, reason));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('Scenario: A reason for oneself — 400 validation naming proxy_reason, nothing written', async () => {
    const before = await rows();
    const named = await post(AUNG, proxyBody(employees.E004, 1));
    const unnamed = await post(AUNG, { branch_id: branches.B3, proxy_reason: 2 });
    for (const res of [named, unnamed]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: ErrorCode.VALIDATION,
        errors: [{ field: 'proxy_reason' }],
      });
    }
    expect(await rows()).toStrictEqual(before);
  });

  it.each([3, 0, '1'])('Scenario: A reason outside the list (%s) — 400 validation', async (reason) => {
    const before = await rows();
    const res = await post(MIN, proxyBody(employees.E004, reason));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION);
    expect(await rows()).toStrictEqual(before);
  });

  it.each([
    ['a performer of another branch (Ko Htet, B1)', employees.E006],
    ['a performer who has left (Ko Naing, ended 30/Sep)', employees.E009],
    ['an id of no employee', '0199a3f2-0000-7000-8000-000000000000'],
  ])('Scenario: %s — 422 not_assigned_to_branch, nothing written', async (_, performer) => {
    const before = await rows();
    const res = await post(MIN, proxyBody(performer, 1));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.NOT_ASSIGNED_TO_BRANCH);
    expect(await rows()).toStrictEqual(before);
  });

  it('Scenario: Ma Hnin (Manager) records for Ko Aung with no code for it — 201', async () => {
    const res = await post(HNIN, proxyBody(employees.E004, 1));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      performed_by: { id: employees.E004 },
      started_by: { user_id: users.E002 },
    });
  });

  // Owner PY-A = A (18/Nov/2026): a reason-1 recorder holds the cash, so he must be assigned too.
  it('Scenarios: A reason-1 recorder who is not assigned — 422; a helper (reason 2) needs no assignment — 201', async () => {
    const assignment = await prisma.employee_branches.findFirstOrThrow({
      where: { employee_id: employees.E005, branch_id: branches.B3 },
    });
    await prisma.employee_branches.update({
      where: { id: assignment.id },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    try {
      const before = await rows();
      const refused = await post(MIN, proxyBody(employees.E004, 1));
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe(ErrorCode.NOT_ASSIGNED_TO_BRANCH);
      expect(await rows()).toStrictEqual(before);
      const helper = await post(MIN, proxyBody(employees.E004, 2));
      expect(helper.status).toBe(201);
      expect(helper.body).toMatchObject({
        performed_by: { id: employees.E004 },
        started_by: { user_id: users.E005 },
        proxy_reason: 2,
      });
    } finally {
      await prisma.employee_branches.update({
        where: { id: assignment.id },
        data: { effective_to: null },
      });
    }
  });
});

describe('The unpaid block is the performer’s (task 2.3 · D-VIS-07 · P4-RULE-02)', () => {
  it('Scenario: Ko Aung unpaid visit blocks a START recorded for him; Ko Min own unpaid visit does not', async () => {
    const minOwn = await api.start(MIN, [services.HAIRCUT]);
    await api.complete(MIN, minOwn.id);
    const aungVisit = await api.start(AUNG, [services.HAIRCUT]);
    await api.complete(AUNG, aungVisit.id);

    const before = await rows();
    const blocked = await post(MIN, proxyBody(employees.E004, 1));
    expect(blocked.status).toBe(422);
    expect(blocked.body).toMatchObject({
      code: ErrorCode.UNPAID_VISIT_OPEN,
      context: { visit_id: aungVisit.id },
    });
    expect(await rows()).toStrictEqual(before);

    // The recorder's own COMPLETED, unpaid visit does not block a START that names another performer.
    const allowed = await post(HNIN, proxyBody(employees.E005, 2));
    expect(allowed.status).toBe(201);
    const helper = await post(MIN, proxyBody(employees.E002, 2));
    expect(helper.status).toBe(201);
    expect(helper.body.performed_by.id).toBe(employees.E002);

    // …and Ko Min is blocked on his own START, by his own unpaid visit.
    const own = await post(MIN, { branch_id: branches.B3 });
    expect(own.status).toBe(422);
    expect(own.body.context).toStrictEqual({ visit_id: minOwn.id });

    // Ko Aung closes his unpaid visit so that the tests below can start for him.
    const closed = await api.post(AUNG, `/visits/${aungVisit.id}/incomplete`, { reason: 'Test cleanup' });
    expect(closed.status).toBe(200);
  });
});

describe('START is idempotent on the resolved performer (task 2.3 · P4-RULE-22)', () => {
  it('Scenarios: A repeat of a START for another barber — 200 replay; the same key for himself — 422 idempotency_mismatch', async () => {
    const key = randomUUID();
    const body = proxyBody(employees.E004, 1);
    const first = await post(MIN, body, key);
    expect(first.status).toBe(201);
    const again = await post(MIN, body, key);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);

    const other = await post(MIN, { branch_id: branches.B3 }, key);
    expect(other.status).toBe(422);
    expect(other.body.code).toBe(ErrorCode.IDEMPOTENCY_MISMATCH);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
  });

  it('proxy_reason is not an identifying field — the same key with reason 2 replays', async () => {
    const key = randomUUID();
    const first = await post(MIN, proxyBody(employees.E004, 1), key);
    const again = await post(MIN, proxyBody(employees.E004, 2), key);
    expect([first.status, again.status]).toStrictEqual([201, 200]);
    expect(again.body.proxy_reason).toBe(1);
  });
});

describe('A late entry for a colleague (task 2.3 · P4-RULE-13 · D-VIS-13) — last, it finalizes a period', () => {
  const late = (extra: object = {}) =>
    proxyBody(employees.E004, 1, {
      late_entry: { reason: LateEntryReason.INTERNET_OUTAGE, started_at: '2026-10-04T15:00:00+06:30' },
      ...extra,
    });

  it('Scenario: Ko Min late-enters Ko Aung Sunday walk-in — 201, business date 04/Oct', async () => {
    const res = await post(MIN, late());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      is_late_entry: true,
      business_date: '2026-10-04',
      performed_by: { id: employees.E004 },
      started_by: { user_id: users.E005 },
    });
  });

  it('Scenario: The payroll lock is the performer’s — 423 payroll_finalized with employee_id = Ko Aung, nothing written', async () => {
    const at = new Date('2026-10-05T09:00:00+06:30');
    await prisma.payroll_runs.create({
      data: {
        id: randomUUID(),
        company_id: (await prisma.companies.findFirstOrThrow()).id,
        period_start: new Date('2026-10-01T00:00:00Z'),
        period_end: new Date('2026-10-04T00:00:00Z'),
        status: PayrollRunStatus.FINALIZED,
        calculated_at: at,
        calculated_by_user_id: users.E001,
        rules_snapshot: {},
        finalized_at: at,
        finalized_by_user_id: users.E001,
        created_by_user_id: users.E001,
      },
    });
    const before = await rows();
    const res = await post(MIN, late());
    expect(res.status).toBe(423);
    expect(res.body).toMatchObject({
      code: ErrorCode.PAYROLL_FINALIZED,
      context: { employee_id: employees.E004 },
    });
    expect(await rows()).toStrictEqual(before);
  });
});
