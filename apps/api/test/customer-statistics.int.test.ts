import { BookingStatus, type Mmk, RefundKind, VisitStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ReadScope } from '../src/common/access/read-scope.js';
import { Clock } from '../src/common/clock/clock.js';
import { CustomerBookingsRepository } from '../src/modules/booking/repositories/customer-bookings.repository.js';
import { SalesCustomerActivity } from '../src/modules/sales/customer-activity/sales-customer-activity.js';
import { VisitsRegistry } from '../src/modules/sales/index.js';
import { bookingAt, cancelBooking } from './builders/bookings.js';
import { type CustomerHistory, addCustomer, customerHistory, mmt } from './builders/customers.js';
import { finishedSale, incompleteVisit } from './builders/sales.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management tasks 2.3 / 2.8 / 2.10 — the statistics pieces below the routes, on Ma Su's
// history of spec-fixtures §2 (design D3 / D6 · D13): customers spec "Visits, total spent and last visit
// count only the caller's read scope" (P3-RULE-03 · D-PLT-04), "No-shows and cancellations are counted
// from the bookings" (owner CM2), "The detail lists the customer's upcoming bookings in the read scope"
// (D-PLT-15) and the visits the preferred barber is picked from (D-CUS-08). The read scope is the
// caller's: Ma Hnin B3, Ko Htet B1, U Kyaw Zin every branch.
const { branches, employees, customers: fixtureCustomers } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;
const MA_HNIN: ReadScope = [branches.B3];
const KO_HTET: ReadScope = [branches.B1];
const KYAW_ZIN: ReadScope = 'all';

let s: SeededApp;
let activity: SalesCustomerActivity;
let bookings: CustomerBookingsRepository;
let history: CustomerHistory;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:00:00+06:30'));
  activity = s.app.get(SalesCustomerActivity);
  bookings = s.app.get(CustomerBookingsRepository);
  // Ma Su's history only: the scenario customers are added by the cases that need one.
  history = await customerHistory(s.prisma, []);
});
afterAll(() => s.close());

const totals = (scope: ReadScope, customerId = MA_SU) => activity.totals(s.prisma, customerId, scope);

/** The list's piece (design D3) for one customer: what the list and the sort read. */
async function aggregateOf(scope: ReadScope, customerId = MA_SU) {
  const rows = await s.prisma.$queryRaw<{ visit_count: number; last_visit_at: Date }[]>`
    SELECT visit_count, last_visit_at FROM (${activity.visitAggregate(scope)}) AS v
    WHERE v.customer_id = ${customerId}::uuid`;
  return rows[0] ?? null;
}

describe('add-customer-management · customers · Visits, total spent and last visit count only the caller’s read scope', () => {
  it('Scenario: Ma Su at B3 — 6 visits, 59,000 (62,000 − the 3,000 refund; the 2,000 change is not subtracted)', async () => {
    expect(await totals(MA_HNIN)).toStrictEqual({
      visit_count: 6,
      total_spent_amount: 59_000n,
      last_visit_at: mmt('2026-09-28', '10:42'),
    });
  });

  it('Scenario: A barber of B1 — 1 visit, 6,000, 03/Oct 10:42 AM', async () => {
    expect(await totals(KO_HTET)).toStrictEqual({
      visit_count: 1,
      total_spent_amount: 6_000n,
      last_visit_at: mmt('2026-10-03', '10:42'),
    });
  });

  it('Scenario: The company admin sees every branch — 7 visits, 65,000, 03/Oct 10:42 AM', async () => {
    expect(await totals(KYAW_ZIN)).toStrictEqual({
      visit_count: 7,
      total_spent_amount: 65_000n,
      last_visit_at: mmt('2026-10-03', '10:42'),
    });
  });

  it('a customer without a sale has zero figures', async () => {
    const koPhyo = await addCustomer(s.prisma, 'KO_PHYO');
    expect(await totals(KYAW_ZIN, koPhyo)).toStrictEqual({
      visit_count: 0,
      total_spent_amount: 0n,
      last_visit_at: null,
    });
    expect(await aggregateOf(KYAW_ZIN, koPhyo)).toBeNull();
    expect(await activity.lastVisitAt(s.prisma, koPhyo, KYAW_ZIN)).toBeNull();
  });

  it('a sale with two refunds counts its total once (10,000 − 1,000 − 2,000 = 7,000)', async () => {
    const id = await addCustomer(s.prisma, 'MA_THIRI');
    await finishedSale(s.prisma, {
      branch: branches.B3,
      customer: id,
      receipt: 'B3-2026-SEP-00090',
      total: 10_000n as Mmk,
      finishedAt: mmt('2026-09-20', '11:00'),
      visit: { performer: 'E004', startedAt: mmt('2026-09-20', '10:30') },
      refunds: [1_000n, 2_000n].map((amount, index) => ({
        kind: RefundKind.SALE_REFUND,
        amount: amount as Mmk,
        receipt: `B3-RF-2026-SEP-0009${index}`,
        at: mmt('2026-09-21', '09:00'),
      })),
    });
    expect((await totals(MA_HNIN, id)).total_spent_amount).toBe(7_000n);
  });

  it('Scenario: An incomplete visit spends nothing — still 6 visits and 59,000', async () => {
    await incompleteVisit(s.prisma, {
      branch: branches.B3,
      performer: 'E004',
      startedAt: mmt('2026-10-02', '10:05'),
    });
    expect(await totals(MA_HNIN)).toStrictEqual({
      visit_count: 6,
      total_spent_amount: 59_000n,
      last_visit_at: mmt('2026-09-28', '10:42'),
    });
  });

  it('Scenario: A sale without a visit counts as spending only — 63,000, still 6 visits, last visit 28/Sep', async () => {
    await finishedSale(s.prisma, {
      branch: branches.B3,
      receipt: 'B3-2026-SEP-00007',
      total: 4_000n as Mmk,
      finishedAt: mmt('2026-09-30', '15:00'),
    });
    expect(await totals(MA_HNIN)).toStrictEqual({
      visit_count: 6,
      total_spent_amount: 63_000n,
      last_visit_at: mmt('2026-09-28', '10:42'),
    });
  });

  it('the list’s piece and the lookup’s last visit are the same definition (design D3 · R2)', async () => {
    for (const scope of [MA_HNIN, KO_HTET, KYAW_ZIN]) {
      const { visit_count, last_visit_at } = await totals(scope);
      expect(await aggregateOf(scope)).toStrictEqual({ visit_count, last_visit_at });
      expect(await activity.lastVisitAt(s.prisma, MA_SU, scope)).toStrictEqual(last_visit_at);
    }
  });
});

describe('add-customer-management · customers · No-shows and cancellations are counted from the bookings', () => {
  it('Scenario: One cancellation and two no-shows at B3 — no_show 2, cancelled 3', async () => {
    expect(await bookings.cancellationCounts(s.prisma, MA_SU, MA_HNIN)).toStrictEqual({
      cancelled: 3,
      no_show: 2,
    });
  });

  it('Scenario: Other branches’ bookings are not counted — Ko Htet reads 0 and 0', async () => {
    expect(await bookings.cancellationCounts(s.prisma, MA_SU, KO_HTET)).toStrictEqual({
      cancelled: 0,
      no_show: 0,
    });
  });

  it('Scenario: Completed and booked bookings are not cancellations — still 3', async () => {
    await bookingAt(s.prisma, {
      branch: branches.B3,
      status: BookingStatus.COMPLETED,
      startsAt: mmt('2026-09-28', '14:00'),
    });
    expect(await bookings.cancellationCounts(s.prisma, MA_SU, MA_HNIN)).toStrictEqual({
      cancelled: 3,
      no_show: 2,
    });
    expect(await bookings.cancellationCounts(s.prisma, MA_SU, KYAW_ZIN)).toStrictEqual({
      cancelled: 3,
      no_show: 2,
    });
  });
});

describe('add-customer-management · customers · The detail lists the customer’s upcoming bookings in the read scope', () => {
  const now = () => s.app.get(Clock).now();
  const upcoming = (scope: ReadScope) => bookings.upcoming(s.prisma, MA_SU, scope, now());

  it('Scenario: Two branches, two callers — U Kyaw Zin B1 then B3, Ma Hnin B3 only', async () => {
    expect(await upcoming(KYAW_ZIN)).toStrictEqual([
      {
        id: history.upcoming.B1,
        starts_at: mmt('2026-10-08', '11:00'),
        branch_id: branches.B1,
        booked_employee_id: employees.E006,
      },
      {
        id: history.upcoming.B3,
        starts_at: mmt('2026-10-12', '14:00'),
        branch_id: branches.B3,
        booked_employee_id: employees.E004,
      },
    ]);
    expect((await upcoming(MA_HNIN)).map((booking) => booking.id)).toStrictEqual([
      history.upcoming.B3,
    ]);
  });

  it('Scenario: Cancelled bookings are not upcoming — Ma Hnin reads none', async () => {
    await cancelBooking(s.prisma, history.upcoming.B3, mmt('2026-10-05', '08:30'));
    expect(await upcoming(MA_HNIN)).toStrictEqual([]);
  });

  it('Scenario: A start at the request time and one just before — 9:00 AM listed, 8:59 AM not', async () => {
    expect(now()).toStrictEqual(new Date('2026-10-05T09:00:00+06:30'));
    const atNine = await bookingAt(s.prisma, {
      branch: branches.B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-05', '09:00'),
      employee: 'E005',
    });
    await bookingAt(s.prisma, {
      branch: branches.B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-05', '08:59'),
    });
    expect((await upcoming(MA_HNIN)).map((booking) => booking.id)).toStrictEqual([atNine]);
  });
});

describe('add-customer-management · customers · the last finished visits the preferred barber is picked from', () => {
  const recent = (scope: ReadScope, window = 5) =>
    activity.recentVisits(s.prisma, MA_SU, scope, window);
  const summary = (visits: Awaited<ReturnType<typeof recent>>) =>
    visits.map((visit) => [visit.finished_at.toISOString(), visit.performed_by_employee_id]);

  it('the window of 5 at B3 leaves out 01/Sep (and the incomplete visit and the visit-less sale)', async () => {
    expect(summary(await recent(MA_HNIN))).toStrictEqual([
      [mmt('2026-09-28', '10:42').toISOString(), employees.E004],
      [mmt('2026-09-25', '10:42').toISOString(), employees.E005],
      [mmt('2026-09-21', '10:42').toISOString(), employees.E004],
      [mmt('2026-09-14', '10:42').toISOString(), employees.E005],
      [mmt('2026-09-07', '10:42').toISOString(), employees.E004],
    ]);
  });

  it('every branch: Ko Htet’s 03/Oct visit first; one visit at B1; a smaller window', async () => {
    expect(summary(await recent(KYAW_ZIN)).map(([, performer]) => performer)).toStrictEqual([
      employees.E006,
      employees.E004,
      employees.E005,
      employees.E004,
      employees.E005,
    ]);
    expect(summary(await recent(KO_HTET))).toStrictEqual([
      [mmt('2026-10-03', '10:42').toISOString(), employees.E006],
    ]);
    expect(await recent(MA_HNIN, 2)).toHaveLength(2);
  });

  it('the performers come from delivery — VisitsPort.readMany answers the visit rows', async () => {
    const visits = await recent(KYAW_ZIN);
    const read = await s.app
      .get(VisitsRegistry)
      .visits.readMany(
        s.prisma,
        visits.map((visit) => visit.visit_id),
      );
    expect(new Map(read.map((visit) => [visit.id, visit.performed_by_employee_id]))).toStrictEqual(
      new Map(visits.map((visit) => [visit.visit_id, visit.performed_by_employee_id])),
    );
    expect(read.every((visit) => visit.status === VisitStatus.FINISHED)).toBe(true);
    expect(await s.app.get(VisitsRegistry).visits.readMany(s.prisma, [])).toStrictEqual([]);
  });
});
