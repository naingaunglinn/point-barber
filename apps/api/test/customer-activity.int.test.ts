import { randomUUID } from 'node:crypto';

import { SaleStatus, VisitStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { Customers } from '../src/modules/booking/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout task 5.3 — the sales implementation of booking's CustomerActivity port:
// customers spec "Returning customer with an earlier visit here" and "Visit at a branch outside the
// read scope" (P3.CUS.02). Ma Su's visit sale finished at B3 on 05/Oct/2026 10:42 AM.
const { branches, users, employees, customers: fixtureCustomers } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let customers: Customers;

async function finishedSale(over: {
  branch: string;
  finishedAt: string;
  withVisit: boolean;
  seq: number;
}): Promise<void> {
  const visitId = over.withVisit ? randomUUID() : null;
  const finishedAt = new Date(over.finishedAt);
  const date = new Date(`${over.finishedAt.slice(0, 10)}T00:00:00Z`);
  if (visitId !== null) {
    await prisma.visits.create({
      data: {
        id: visitId,
        client_request_id: randomUUID(),
        branch_id: over.branch,
        performed_by_employee_id: employees.E004,
        started_by_user_id: users.E004,
        started_at: new Date(finishedAt.getTime() - 40 * 60_000),
        business_date: date,
        status: VisitStatus.FINISHED,
        completed_at: new Date(finishedAt.getTime() - 5 * 60_000),
        completed_by_user_id: users.E004,
        finished_at: finishedAt,
      },
    });
  }
  await prisma.sales.create({
    data: {
      id: randomUUID(),
      client_request_id: randomUUID(),
      branch_id: over.branch,
      visit_id: visitId,
      customer_id: fixtureCustomers.MA_SU,
      status: SaleStatus.FINISHED,
      receipt_number: `T-2026-OCT-${String(over.seq).padStart(5, '0')}`,
      receipt_year: 2026,
      receipt_month: 10,
      receipt_seq: over.seq,
      finished_at: finishedAt,
      finished_by_user_id: users.E004,
      business_date: date,
    },
  });
}

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-06T09:00:00+06:30'));
  prisma = s.app.get(PrismaService);
  customers = s.app.get(Customers);
  await finishedSale({
    branch: branches.B3,
    finishedAt: '2026-10-05T10:42:00+06:30',
    withVisit: true,
    seq: 1,
  });
  // A later product-only sale is not a visit.
  await finishedSale({
    branch: branches.B3,
    finishedAt: '2026-10-05T18:00:00+06:30',
    withVisit: false,
    seq: 2,
  });
});
afterAll(() => s.close());

describe('CustomerActivity of sales — last_visit_at (P3.CUS.02)', () => {
  it('Scenario: Returning customer with an earlier visit here — 05/Oct 10:42 AM', async () => {
    const result = await customers.lookup(prisma, '09 7712 3456', [branches.B3]);
    expect(result.customer?.last_visit_at).toBe('2026-10-05T10:42:00+06:30');
  });

  it('Scenario: Visit at a branch outside the read scope — null for Ko Htet (B1)', async () => {
    const result = await customers.lookup(prisma, '09 7712 3456', [branches.B1]);
    expect(result.customer?.name).toBe('Ma Su');
    expect(result.customer?.last_visit_at).toBeNull();
  });

  it('a company-wide scope sees every branch', async () => {
    const result = await customers.lookup(prisma, '+95977123456', 'all');
    expect(result.customer?.last_visit_at).toBe('2026-10-05T10:42:00+06:30');
  });
});
