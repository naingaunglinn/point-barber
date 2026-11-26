import type { Mmk } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { Customers } from '../src/modules/booking/index.js';
import { finishedSale } from './builders/sales.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout task 5.3 — the sales implementation of booking's CustomerActivity port:
// customers spec "Returning customer with an earlier visit here" and "Visit at a branch outside the
// read scope" (P3.CUS.02). Ma Su's visit sale finished at B3 on 05/Oct/2026 10:42 AM.
const { branches } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let customers: Customers;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-06T09:00:00+06:30'));
  prisma = s.app.get(PrismaService);
  customers = s.app.get(Customers);
  await finishedSale(prisma, {
    branch: branches.B3,
    receipt: 'B3-2026-OCT-00001',
    total: 8_000n as Mmk,
    finishedAt: new Date('2026-10-05T10:42:00+06:30'),
    visit: { performer: 'E004', startedAt: new Date('2026-10-05T10:05:00+06:30') },
  });
  // A later product-only sale is not a visit.
  await finishedSale(prisma, {
    branch: branches.B3,
    receipt: 'B3-2026-OCT-00002',
    total: 2_000n as Mmk,
    finishedAt: new Date('2026-10-05T18:00:00+06:30'),
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
