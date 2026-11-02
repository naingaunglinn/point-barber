import { randomUUID } from 'node:crypto';

import { BookingStatus, SaleStatus, branchSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { BranchUsage } from '../src/modules/people/index.js';
import {
  B4,
  assignAt,
  bookingAt,
  cancelBooking,
  endAssignment,
  saleAt,
} from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management tasks 3.5 – 3.7 / 3.11 — organization spec "A branch that is still in use
// cannot be deactivated", "Re-activation has no guard and a repeated status changes nothing", the
// status limits of "A branch is deactivated or re-activated only with branch.delete held at company
// scope", the two counters of the BranchUsage registry and design R1 (P1-RULE-09 · P1.BR.05 ·
// API-IDEM-01 · D-BKG-18 · D-DAT-05 · D-PLT-15 · owner BR2 · design D1 / D3). B4 is created by U Kyaw
// Zin; its bookings and sales are written by the test builders (design D11). One B4 tells the story:
// each scenario starts from the state the previous one left, as its WHEN describes.
const B = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
let t: SeededApp;
let kyawZin: { readonly cookie: string };
let b4 = '';

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  kyawZin = await t.signIn('E001');
  const created = await t.http.post('/api/v1/branches').set('Cookie', kyawZin.cookie).send(B4);
  expect(created.status).toBe(201);
  b4 = (created.body as { id: string }).id;
});
afterAll(async () => {
  await t.close();
});

const setStatus = (id: string, body: object) =>
  t.http.post(`/api/v1/branches/${id}/status`).set('Cookie', kyawZin.cookie).send(body);
const at = (instant: string) => t.clock?.set(new Date(instant));
const statusOf = async (id: string) =>
  (await t.prisma.branches.findUniqueOrThrow({ where: { id } })).status;
const inUse = (open_bookings: number, open_sales: number, active_assignments: number) => ({
  code: 'branch_in_use',
  context: { open_bookings, open_sales, active_assignments },
});
const counts = (branchId: string) =>
  t.app
    .get(TransactionRunner)
    .run((tx) => t.app.get(BranchUsage).countsFor(tx, branchId, '2026-10-05'));

describe('add-branch-management · the BranchUsage counters (task 3.5)', () => {
  it('open_bookings counts status 1 and 2 on any date, not 0 or 3; open_sales counts status 1, not 0 or 2', async () => {
    // B2 has no booking or sale in the fixture.
    const day = (n: number, hour: number) =>
      new Date(
        `2026-10-${String(n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+06:30`,
      );
    await bookingAt(t.prisma, B.B2, BookingStatus.BOOKED, day(1, 10)); // in the past
    await bookingAt(t.prisma, B.B2, BookingStatus.STARTED, day(5, 11));
    await bookingAt(t.prisma, B.B2, BookingStatus.BOOKED, day(20, 12)); // in the future
    await bookingAt(t.prisma, B.B2, BookingStatus.CANCELLED, day(6, 13));
    await bookingAt(t.prisma, B.B2, BookingStatus.COMPLETED, day(4, 14));
    await saleAt(t.prisma, B.B2, SaleStatus.OPEN, day(5, 9));
    await saleAt(t.prisma, B.B2, SaleStatus.CANCELLED, day(5, 9));
    await saleAt(t.prisma, B.B2, SaleStatus.FINISHED, day(5, 9));
    expect(await counts(B.B2)).toStrictEqual({
      open_bookings: 3,
      open_sales: 1,
      active_assignments: 2, // U Kyaw Zin and Ko Thura (spec-fixtures §2)
    });
  });
});

describe('add-branch-management · organization · A branch that is still in use cannot be deactivated', () => {
  it('Scenario: A fixture branch is in use', async () => {
    const res = await setStatus(B.B3, { status: 0 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(inUse(0, 0, 5));
    expect(await statusOf(B.B3)).toBe(1);
  });

  it('Scenario: An open booking', async () => {
    const booking = await bookingAt(
      t.prisma,
      b4,
      BookingStatus.BOOKED,
      new Date('2026-10-06T10:00:00+06:30'),
    );
    const first = await setStatus(b4, { status: 0 });
    expect(first.status).toBe(409);
    expect(first.body).toMatchObject(inUse(1, 0, 0));
    await cancelBooking(t.prisma, booking, new Date('2026-10-05T09:40:00+06:30'));
    const second = await setStatus(b4, { status: 0 });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ status: 0 });
  });

  it('Scenario: Re-activating a branch (Re-activation has no guard)', async () => {
    const res = await setStatus(b4, { status: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 1 });
    const inactive = await t.http.get('/api/v1/branches?status=0').set('Cookie', kyawZin.cookie);
    expect(inactive.body).toStrictEqual({ items: [] });
  });

  it('Scenario: An open sale', async () => {
    const sale = await saleAt(t.prisma, b4, SaleStatus.OPEN, new Date('2026-10-05T09:45:00+06:30'));
    const res = await setStatus(b4, { status: 0 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(inUse(0, 1, 0));
    expect(await statusOf(b4)).toBe(1);
    // The sale is cancelled for the next scenario.
    await t.prisma.sales.update({
      where: { id: sale },
      data: { status: SaleStatus.CANCELLED, cancelled_at: new Date('2026-10-05T09:50:00+06:30') },
    });
  });

  it('Scenario: Finished records do not count', async () => {
    // B4 now holds a CANCELLED booking and a CANCELLED sale; add a COMPLETED booking and a FINISHED sale.
    await bookingAt(t.prisma, b4, BookingStatus.COMPLETED, new Date('2026-10-05T08:00:00+06:30'));
    await saleAt(t.prisma, b4, SaleStatus.FINISHED, new Date('2026-10-05T08:40:00+06:30'));
    const res = await setStatus(b4, { status: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 0 });
    expect((await setStatus(b4, { status: 1 })).status).toBe(200);
  });

  it('Scenario: An assignment on its last day', async () => {
    const assignment = await assignAt(t.prisma, {
      employeeId: E.E006,
      branchId: b4,
      from: '2026-10-01',
    });
    await endAssignment(t.prisma, assignment, '2026-10-05');
    at('2026-10-05T23:59:00+06:30');
    const lastDay = await setStatus(b4, { status: 0 });
    expect(lastDay.status).toBe(409);
    expect(lastDay.body).toMatchObject(inUse(0, 0, 1));
    at('2026-10-06T00:00:00+06:30');
    const nextDay = await setStatus(b4, { status: 0 });
    expect(nextDay.status).toBe(200);
    expect(nextDay.body).toMatchObject({ status: 0 });
  });
});

describe('add-branch-management · organization · Re-activation has no guard and a repeated status changes nothing', () => {
  it('Scenario: A double tap on Deactivate', async () => {
    at('2026-10-06T09:00:00+06:30');
    expect((await setStatus(b4, { status: 1 })).status).toBe(200);
    at('2026-10-06T09:05:00+06:30');
    const first = await setStatus(b4, { status: 0, reason: 'Not opening this year' });
    at('2026-10-06T09:05:01+06:30');
    const second = await setStatus(b4, { status: 0, reason: 'Not opening this year' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [one, two] = [branchSchema.parse(first.body), branchSchema.parse(second.body)];
    expect(one.status).toBe(0);
    expect(two.status).toBe(0);
    expect(two.updated_at).toBe(one.updated_at);
    const rows = await t.prisma.audit_events.findMany({
      where: {
        action: 'branch.status',
        entity_id: b4,
        request_id: {
          in: [first.headers['x-request-id'] as string, second.headers['x-request-id'] as string],
        },
      },
    });
    expect(rows).toHaveLength(1);
  });

  it('Scenario: The row stays', async () => {
    const row = await t.prisma.branches.findUniqueOrThrow({ where: { id: b4 } });
    expect(row).toMatchObject({ status: 0, archived_at: null });
  });

  it('a repeated re-activation is a 200 that writes nothing as well', async () => {
    expect((await setStatus(b4, { status: 1 })).status).toBe(200);
    const again = await setStatus(b4, { status: 1 });
    expect(again.status).toBe(200);
    expect(
      await t.prisma.audit_events.count({
        where: { request_id: again.headers['x-request-id'] as string },
      }),
    ).toBe(0);
  });
});

describe('add-branch-management · organization · A branch is deactivated or re-activated only with branch.delete held at company scope — limits', () => {
  it('Scenario: Status and reason limits', async () => {
    const two = await setStatus(b4, { status: 2 });
    expect(two.status).toBe(400);
    expect(two.body).toMatchObject({ code: 'validation', errors: [{ field: 'status' }] });
    const long = await setStatus(b4, { status: 0, reason: 'ရ'.repeat(501) });
    expect(long.status).toBe(400);
    expect((long.body as { errors: unknown[] }).errors[0]).toStrictEqual({
      field: 'reason',
      code: 'too_big',
      params: { maximum: 500 },
    });
    const ok = await setStatus(b4, { status: 0, reason: 'ရ'.repeat(500) });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 0 });
    expect((await setStatus(b4, { status: 1 })).status).toBe(200);
  });
});

describe('add-branch-management · design R1 — a writer holding the branch row FOR SHARE (task 3.11)', () => {
  it('makes the deactivation wait; after its commit the deactivation counts its booking (409, open_bookings = 1)', async () => {
    expect(await statusOf(b4)).toBe(1);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const writer = t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM branches WHERE id = ${b4}::uuid FOR SHARE`;
        const start = new Date('2026-10-07T10:00:00+06:30');
        await tx.bookings.create({
          data: {
            id: randomUUID(),
            branch_id: b4,
            customer_id: FIXTURE_IDS.customers.MA_SU,
            customer_name: 'Ma Su',
            booked_employee_id: E.E005,
            channel: 2,
            created_by_user_id: FIXTURE_IDS.users.E001,
            starts_at: start,
            ends_at: new Date(start.getTime() + 30 * 60_000),
            block_starts_at: start,
            block_ends_at: new Date(start.getTime() + 30 * 60_000),
            business_date: new Date('2026-10-07T00:00:00Z'),
            status: BookingStatus.BOOKED,
            manage_token_hash: `test-r1-${randomUUID()}`,
          },
        });
        locked();
        await released;
      },
      { timeout: 20_000 },
    );
    await holding;
    const deactivation = setStatus(b4, { status: 0 }).then((res) => res);
    // The deactivation's FOR UPDATE waits on the writer's FOR SHARE.
    let waiting = 0;
    for (let attempt = 0; attempt < 100 && waiting === 0; attempt += 1) {
      const rows = await t.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      waiting = Number(rows[0]?.n ?? 0);
      if (waiting === 0) await new Promise((done) => setTimeout(done, 50));
    }
    expect(waiting).toBeGreaterThan(0);
    release();
    await writer;
    const res = await deactivation;
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject(inUse(1, 0, 0));
    expect(await statusOf(b4)).toBe(1);
  });
});
