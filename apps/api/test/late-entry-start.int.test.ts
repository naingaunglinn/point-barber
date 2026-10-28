import { randomUUID } from 'node:crypto';

import {
  DailyClosingStatus,
  ErrorCode,
  LateEntryReason,
  LocationType,
  PayrollRunStatus,
  ScopeType,
  VisitStatus,
  visitSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { cookieOf, createPerson } from './helpers/people.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-late-entry tasks 2.1 – 2.5 — visits spec "A late entry records yesterday's paper walk-in" and the
// modified START requirements (P4.VIS.03 · P4-RULE-02 / 03 / 05 / 13 · D-VIS-13 · LE-1 · owner B9 /
// B11 / B12 · design D3), through the HTTP endpoint and the guards. The clock is fixed at Monday
// 05/Oct/2026 9:30 AM MMT (CG-TIME-03); the paper walk-in is Sunday 04/Oct at B3.
const { branches, services, employees, users } = FIXTURE_IDS;
const NOW = '2026-10-05T09:30:00+06:30';
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;

beforeAll(async () => {
  s = await seededApp(new Date(NOW));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
});
afterAll(() => s.close());

const lateStart = (late: Record<string, unknown> | null, items: string[] = [services.HAIRCUT]) => ({
  branch_id: branches.B3,
  items: items.map((service_id) => ({ service_id })),
  late_entry: late,
});
const outage = (startedAt = '2026-10-04T15:00:00+06:30') => ({
  reason: LateEntryReason.INTERNET_OUTAGE,
  started_at: startedAt,
});
const post = (who: 'E004' | 'E005' | 'E006', body: object, key: string = randomUUID()) =>
  api.post(who, '/visits', body, key);
const visitCount = () => prisma.visits.count();

describe('add-late-entry · permission (task 2.1 · D-VIS-13 · owner B12)', () => {
  it('Scenario: A barber whose role has no sale.late_entry — 403 forbidden, nothing created', async () => {
    const person = await createPerson(prisma, (await prisma.companies.findFirstOrThrow()).id, {
      branches: [{ id: branches.B3, from: '2026-09-01' }],
    });
    await assignRole(prisma, {
      name: 'Barber without late entry',
      employeeId: person.employeeId,
      codes: ['sale.create'],
      scope: ScopeType.BRANCHES,
      branchIds: [branches.B3],
    });
    const before = await visitCount();
    const res = await s.http
      .post('/api/v1/visits')
      .set('Cookie', cookieOf(person.token))
      .set('Idempotency-Key', randomUUID())
      .send(lateStart(outage()));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      context: { required: 'sale.late_entry' },
    });
    expect(await visitCount()).toBe(before);
  });

  it('Scenario: Ko Htet (B1) enters a late entry for B3 — 403 out_of_scope', async () => {
    const before = await visitCount();
    const res = await post(HTET, lateStart(outage()));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(ErrorCode.OUT_OF_SCOPE);
    expect(await visitCount()).toBe(before);
  });
});

describe('add-late-entry · payload and stored fields (task 2.2 · P4-RULE-13 · API-DATA-11)', () => {
  it("Scenario: Yesterday's internet outage — Ko Aung records Sunday's 3:00 PM haircut", async () => {
    const res = await post(AUNG, lateStart(outage()));
    expect(res.status).toBe(201);
    const visit = visitSchema.parse(res.body);
    expect(visit).toMatchObject({
      status: VisitStatus.STARTED,
      is_late_entry: true,
      late_entry_reason: LateEntryReason.INTERNET_OUTAGE,
      late_entry_note: null,
      started_at: '2026-10-04T15:00:00+06:30',
      business_date: '2026-10-04',
      recorded_at: NOW,
      started_by: { user_id: users.E004 },
      performed_by: { id: employees.E004 },
      location_type: LocationType.BRANCH,
    });
    const row = await prisma.visits.findUniqueOrThrow({ where: { id: visit.id } });
    expect(row).toMatchObject({
      is_late_entry: true,
      late_entry_reason: LateEntryReason.INTERNET_OUTAGE,
      started_at: new Date('2026-10-04T15:00:00+06:30'),
      business_date: new Date('2026-10-04T00:00:00Z'),
      created_at: new Date(NOW),
    });
  });

  it('a start sent in UTC is stored as the same instant', async () => {
    const res = await post(MIN, lateStart(outage('2026-10-04T08:30:00Z')));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      started_at: '2026-10-04T15:00:00+06:30',
      business_date: '2026-10-04',
    });
  });

  it('Scenario: OTHER without a note, or with a blank one — 400 reason_required', async () => {
    for (const note of [undefined, null, '   ']) {
      const res = await post(
        MIN,
        lateStart({
          ...outage(),
          reason: LateEntryReason.OTHER,
          ...(note === undefined ? {} : { note }),
        }),
      );
      expect(res.status, String(note)).toBe(400);
      expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    }
  });

  it('OTHER with a note — 201, the note stored', async () => {
    const res = await post(
      MIN,
      lateStart({ ...outage(), reason: LateEntryReason.OTHER, note: 'Card machine queue' }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      late_entry_reason: LateEntryReason.OTHER,
      late_entry_note: 'Card machine queue',
    });
  });

  it('Scenario: started_at missing — 400 validation naming late_entry.started_at', async () => {
    const res = await post(MIN, lateStart({ reason: LateEntryReason.FORGOT }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'late_entry.started_at' }],
    });
  });

  it('a walk-in without late_entry is a live visit, as before', async () => {
    const res = await post(MIN, { branch_id: branches.B3 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      is_late_entry: false,
      late_entry_reason: null,
      started_at: NOW,
      business_date: '2026-10-05',
    });
  });

  // late_entry is not an identifying member: a replay returns the first visit even when the times
  // differ (recorded reading 5 · P4-RULE-02).
  it('a replay answers the stored late entry, whatever late_entry it sends', async () => {
    const key = randomUUID();
    const first = await post(MIN, lateStart(outage('2026-10-04T16:00:00+06:30'), []), key);
    expect(first.status).toBe(201);
    for (const again of [
      lateStart(outage('2026-10-04T16:00:00+06:30'), []),
      lateStart(outage('2026-10-04T16:05:00+06:30'), []),
      { branch_id: branches.B3 },
    ]) {
      const replay = await post(MIN, again, key);
      expect(replay.status).toBe(200);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body).toMatchObject({
        id: first.body.id,
        started_at: '2026-10-04T16:00:00+06:30',
      });
    }
    expect(
      await prisma.audit_events.count({
        where: { action: 'visit.start', entity_id: first.body.id },
      }),
    ).toBe(1);
  });
});

describe('add-late-entry · dates (task 2.3 · P4-RULE-02 / 05 / 13 · LE-1)', () => {
  // The refusal comes before the day lock: a start on 06/Oct would otherwise answer the day lock's
  // date_in_future, so `late_entry_time` shows that no lock was asked for (design D3 step 2).
  it.each([
    ['9:35 AM today, five minutes from now', '2026-10-05T09:35:00+06:30'],
    ['tomorrow', '2026-10-06T10:00:00+06:30'],
  ])(
    'Scenario: A start later than now (%s) — 422 late_entry_time, nothing created',
    async (_, at) => {
      const before = await visitCount();
      const res = await post(MIN, lateStart(outage(at)));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
      expect(await visitCount()).toBe(before);
    },
  );

  it('a start equal to now is accepted', async () => {
    const res = await post(MIN, lateStart(outage(NOW), []));
    expect(res.status).toBe(201);
    expect(res.body.business_date).toBe('2026-10-05');
  });

  it('Scenario: Ko Min assigned from 05/Oct enters 04/Oct — 422 not_assigned_to_branch', async () => {
    const assignment = await prisma.employee_branches.findFirstOrThrow({
      where: { employee_id: employees.E005, branch_id: branches.B3 },
    });
    await prisma.employee_branches.update({
      where: { id: assignment.id },
      data: { effective_from: new Date('2026-10-05T00:00:00Z') },
    });
    try {
      const res = await post(MIN, lateStart(outage()));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe(ErrorCode.NOT_ASSIGNED_TO_BRANCH);
      const today = await post(MIN, lateStart(outage('2026-10-05T08:00:00+06:30'), []));
      expect(today.status).toBe(201);
    } finally {
      await prisma.employee_branches.update({
        where: { id: assignment.id },
        data: { effective_from: assignment.effective_from },
      });
    }
  });

  it('Scenario: The line is priced on the service day — 8,000 on 04/Oct, 9,000 from 05/Oct', async () => {
    const current = await prisma.service_prices.findFirstOrThrow({
      where: { branch_id: branches.B3, service_id: services.HAIRCUT, employee_id: null },
    });
    await prisma.service_prices.update({
      where: { id: current.id },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const scheduled = await prisma.service_prices.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        service_id: services.HAIRCUT,
        location_type: LocationType.BRANCH,
        price_amount: 9000n,
        effective_from: new Date('2026-10-05T00:00:00Z'),
      },
    });
    try {
      const late = await post(MIN, lateStart(outage()));
      expect(late.status).toBe(201);
      expect(late.body.sale.items[0]).toMatchObject({ unit_price_amount: 8000 });
      const live = await post(MIN, {
        branch_id: branches.B3,
        items: [{ service_id: services.HAIRCUT }],
      });
      expect(live.status).toBe(201);
      expect(live.body.sale.items[0]).toMatchObject({ unit_price_amount: 9000 });
    } finally {
      await prisma.service_prices.delete({ where: { id: scheduled.id } });
      await prisma.service_prices.update({
        where: { id: current.id },
        data: { effective_to: current.effective_to },
      });
    }
  });
});

describe('add-late-entry · the unpaid block both ways (task 2.5 · D-VIS-07 · P4-RULE-02 #5)', () => {
  // Ko Min has STARTED visits from the tests above and no COMPLETED one: nothing blocks him yet.
  it('Scenario: An unpaid, completed late entry does not block a normal START', async () => {
    const late = await post(MIN, lateStart(outage('2026-10-04T11:00:00+06:30')));
    expect(late.status).toBe(201);
    const done = await api.post(MIN, `/visits/${late.body.id}/complete`, {
      completed_at: '2026-10-04T11:30:00+06:30',
    });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe(VisitStatus.COMPLETED);
    const live = await post(MIN, {
      branch_id: branches.B3,
      items: [{ service_id: services.HAIRCUT }],
    });
    expect(live.status).toBe(201);
  });

  it('Scenario: A late entry passes while a normal visit is unpaid, which still blocks the next normal START', async () => {
    const live = await api.start(AUNG);
    await api.complete(AUNG, live.id);
    const late = await post(AUNG, lateStart(outage('2026-10-04T12:00:00+06:30')));
    expect(late.status).toBe(201);
    const next = await post(AUNG, { branch_id: branches.B3 });
    expect(next.status).toBe(422);
    expect(next.body).toMatchObject({
      code: ErrorCode.UNPAID_VISIT_OPEN,
      context: { visit_id: live.id },
    });
  });
});

// Last in the file: the CLOSED 04/Oct and the FINALIZED September stay for the rest of the run.
describe('add-late-entry · gates at START (task 2.4 · P7-RULE-02 · P5-RULE-10 · owner B9 / B11)', () => {
  beforeAll(async () => {
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date('2026-10-04T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-04T21:05:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const at = new Date('2026-10-02T09:00:00+06:30');
    await prisma.payroll_runs.create({
      data: {
        id: randomUUID(),
        company_id: (await prisma.companies.findFirstOrThrow()).id,
        period_start: new Date('2026-09-01T00:00:00Z'),
        period_end: new Date('2026-09-30T00:00:00Z'),
        status: PayrollRunStatus.FINALIZED,
        calculated_at: at,
        calculated_by_user_id: users.E001,
        rules_snapshot: {},
        finalized_at: at,
        finalized_by_user_id: users.E001,
        created_by_user_id: users.E001,
      },
    });
  });

  it('Scenario: The day is closed — 422 day_closed with its context, nothing created', async () => {
    const before = await visitCount();
    const res = await post(MIN, lateStart(outage()));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: ErrorCode.DAY_CLOSED,
      context: {
        branch_id: branches.B3,
        business_date: '2026-10-04',
        correction_path: 'reopen',
      },
    });
    expect(await visitCount()).toBe(before);
  });

  it('Scenario: No closing row for 02/Oct — 201 (any day not closed — owner B11)', async () => {
    const res = await post(MIN, lateStart(outage('2026-10-02T15:00:00+06:30'), []));
    expect(res.status).toBe(201);
    expect(res.body.business_date).toBe('2026-10-02');
  });

  it('Scenario: September is finalized — 30/Sep 6:00 PM → 423 payroll_finalized; 01/Oct 10:00 AM → 201', async () => {
    const refused = await post(MIN, lateStart(outage('2026-09-30T18:00:00+06:30'), []));
    expect(refused.status).toBe(423);
    expect(refused.body).toMatchObject({
      code: ErrorCode.PAYROLL_FINALIZED,
      context: {
        employee_id: employees.E005,
        period: { start: '2026-09-01', end: '2026-09-30' },
        status: PayrollRunStatus.FINALIZED,
      },
    });
    const october = await post(MIN, lateStart(outage('2026-10-01T10:00:00+06:30'), []));
    expect(october.status).toBe(201);
    expect(october.body.business_date).toBe('2026-10-01');
  });

  it('a normal START today is not gated by the closed Sunday or the finalized September', async () => {
    const res = await post(HTET, { branch_id: branches.B1 });
    expect(res.status).toBe(201);
  });
});
