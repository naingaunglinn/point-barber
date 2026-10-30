import { randomUUID } from 'node:crypto';

import {
  AuditSource,
  DailyClosingStatus,
  ErrorCode,
  SaleStatus,
  VisitStatus,
  visitSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Visits } from '../src/modules/delivery/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_HTET, KO_MIN, type FixturePerson, U_KYAW_ZIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 6.5 – 6.7, 6.19 (service part) — visits spec "START records a
// walk-in…", "START is idempotent…" and "A completed, unpaid visit blocks the performer's next START"
// (P4.VIS.03 · P4-RULE-02 · P4-RULE-22 · API-IDEM-01 / 02 · design D4 / D7) on the fixture data. The
// clock is fixed at 05/Oct/2026 10:05 AM MMT. The endpoint is wired with the access guards.
const { branches, services, employees } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let visits: Visits;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:05:00+06:30'));
  prisma = s.app.get(PrismaService);
  visits = s.app.get(Visits);
});
afterAll(() => s.close());

const start = (
  who: FixturePerson,
  body: { branch_id: string; items?: { service_id: string }[] },
  key: string = randomUUID(),
) => as(who, () => visits.start(who.viewer, who.scope, body, key));

async function refusal(work: () => Promise<unknown>): Promise<ProblemException> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

const nameOf = async (employeeId: string) =>
  (await prisma.employees.findUniqueOrThrow({ where: { id: employeeId } })).name_mm;

describe('START (P4.VIS.03)', () => {
  it('Scenario: Ko Aung starts a walk-in — 201 values, an empty OPEN sale', async () => {
    const { replayed, visit } = await start(KO_AUNG, { branch_id: branches.B3 });
    expect(visitSchema.parse(visit)).toStrictEqual(visit);
    expect(replayed).toBe(false);
    expect(visit).toMatchObject({
      status: VisitStatus.STARTED,
      performed_by: { id: employees.E004, display_name: await nameOf(employees.E004) },
      started_by: { user_id: FIXTURE_IDS.users.E004 },
      proxy_reason: null,
      location_type: 1,
      booking_id: null,
      business_date: '2026-10-05',
      started_at: '2026-10-05T10:05:00+06:30',
      warnings: [],
    });
    expect(visit.sale).toMatchObject({
      status: SaleStatus.OPEN,
      customer: null,
      items: [],
      total_amount: 0,
      visit_id: visit.id,
      actions: { edit_lines: true, take_payment: true, finish: false, mark_incomplete: true },
    });
  });

  it('Scenario: First service chosen on the START sheet — Haircut at 10,000, no reason', async () => {
    const { visit } = await start(KO_AUNG, {
      branch_id: branches.B3,
      items: [{ service_id: services.HAIRCUT }],
    });
    expect(
      visit.sale.items.map((item) => [item.description_en, item.unit_price_amount]),
    ).toStrictEqual([['Haircut', 10000]]);
    expect(visit.sale.items[0]?.added_reason).toBeNull();
    expect([visit.sale.subtotal_amount, visit.sale.total_amount]).toStrictEqual([10000, 10000]);
    expect(visit.warnings).toStrictEqual([]);
  });

  it('Scenario: A barber of another branch cannot start at B3 — 403 out_of_scope, no rows', async () => {
    const before = await prisma.visits.count();
    const error = await refusal(() => start(KO_HTET, { branch_id: branches.B3 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.OUT_OF_SCOPE, 403]);
    expect(await prisma.visits.count()).toBe(before);
  });

  it('Scenario: Performer no longer assigned to the branch — 422 not_assigned_to_branch', async () => {
    const assignment = await prisma.employee_branches.findFirstOrThrow({
      where: { employee_id: employees.E005, branch_id: branches.B3 },
    });
    await prisma.employee_branches.update({
      where: { id: assignment.id },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const before = await prisma.sales.count();
    const error = await refusal(() => start(KO_MIN, { branch_id: branches.B3 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.NOT_ASSIGNED_TO_BRANCH, 422]);
    expect(await prisma.sales.count()).toBe(before);
    await prisma.employee_branches.update({
      where: { id: assignment.id },
      data: { effective_to: null },
    });
  });

  it('a closed branch-day — 422 day_closed (P7-RULE-02 · owner B9)', async () => {
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B1,
        business_date: new Date('2026-10-05T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-05T09:00:00+06:30'),
        closed_by_user_id: FIXTURE_IDS.users.E003,
      },
    });
    const error = await refusal(() => start(KO_HTET, { branch_id: branches.B1 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.DAY_CLOSED, 422]);
    expect(error.options.context).toMatchObject({ correction_path: 'reopen' });
  });
});

describe('START is idempotent (API-IDEM-01 / 02 · design D7)', () => {
  it('Scenario: Second request after the first has answered — 200 replay, one visit and one sale', async () => {
    const key = randomUUID();
    const first = await start(KO_MIN, { branch_id: branches.B3 }, key);
    const second = await start(KO_MIN, { branch_id: branches.B3 }, key);
    expect(second.replayed).toBe(true);
    expect(second.visit.id).toBe(first.visit.id);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
    expect(await prisma.sales.count({ where: { client_request_id: key } })).toBe(1);
  });

  it('Scenario: Same key, different branch — 422 idempotency_mismatch, nothing at B1', async () => {
    const key = randomUUID();
    await start(U_KYAW_ZIN, { branch_id: branches.B3 }, key);
    const error = await refusal(() => start(U_KYAW_ZIN, { branch_id: branches.B1 }, key));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.IDEMPOTENCY_MISMATCH, 422]);
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(1);
  });

  it('Scenario: Second request while the first is still running — 409 idempotency_in_progress', async () => {
    const key = randomUUID();
    // The first request's try-lock on the key, held by another open transaction.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`idem:${key}`}, 0))`;
      const error = await refusal(() => start(KO_MIN, { branch_id: branches.B3 }, key));
      expect([error.code, error.status]).toStrictEqual([ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409]);
    });
    expect(await prisma.visits.count({ where: { client_request_id: key } })).toBe(0);
  });

  it('one visit.start audit row per START, none for the replay (P4-RULE-21)', async () => {
    const key = randomUUID();
    const { visit } = await start(KO_MIN, { branch_id: branches.B3 }, key);
    await start(KO_MIN, { branch_id: branches.B3 }, key);
    const rows = await prisma.audit_events.findMany({
      where: { entity_type: 'visits', entity_id: visit.id, source: AuditSource.APP },
      select: { action: true, actor_user_id: true, branch_id: true },
    });
    expect(rows).toStrictEqual([
      { action: 'visit.start', actor_user_id: FIXTURE_IDS.users.E005, branch_id: branches.B3 },
    ]);
  });
});

describe('A completed, unpaid visit blocks the next START (P4-RULE-02 · D-VIS-07)', () => {
  it('two STARTED visits are allowed; a COMPLETED unpaid one blocks; Ko Min is not blocked; INCOMPLETE unblocks', async () => {
    // Ko Aung already has STARTED visits from the tests above.
    const open = await prisma.visits.count({
      where: { performed_by_employee_id: employees.E004, status: VisitStatus.STARTED },
    });
    expect(open).toBeGreaterThanOrEqual(2);
    const { visit: b } = await start(KO_AUNG, {
      branch_id: branches.B3,
      items: [{ service_id: services.HAIRCUT }],
    });
    await as(KO_AUNG, () => visits.complete(KO_AUNG.viewer, b.id));
    const blocked = await refusal(() => start(KO_AUNG, { branch_id: branches.B3 }));
    expect([blocked.code, blocked.status]).toStrictEqual([ErrorCode.UNPAID_VISIT_OPEN, 422]);
    expect(blocked.options.context).toStrictEqual({ visit_id: b.id });
    expect((await start(KO_MIN, { branch_id: branches.B3 })).replayed).toBe(false);
    await as(KO_AUNG, () =>
      visits.incomplete(KO_AUNG.viewer, b.id, 'Customer left without paying'),
    );
    expect((await start(KO_AUNG, { branch_id: branches.B3 })).replayed).toBe(false);
  });
});
