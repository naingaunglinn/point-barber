import { CustomerStatus, ErrorCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Customers } from '../src/modules/booking/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout tasks 5.1 – 5.3 (service part) — customers spec "FINISH finds or creates the
// customer by phone" and "The Finish step looks a customer up by phone" (P3-RULE-01 · D-CUS-02 / 03 ·
// API-DATA-06 · P3.CUS.02) on the fixture customer Ma Su `09 7712 3456`. The lookup endpoint is wired
// with the access guards; last_visit_at comes through the CustomerActivity port (a test double here,
// the sales implementation with FINISH).
const { customers: fixtureCustomers, users } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;
const KO_AUNG = users.E004;

let s: SeededApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let customers: Customers;
let lastVisits: { customerId: string; branchIds: readonly string[] | 'all' }[];

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-06T09:00:00+06:30'));
  prisma = s.app.get(PrismaService);
  runner = s.app.get(TransactionRunner);
  customers = s.app.get(Customers);
  lastVisits = [];
  customers.useActivity({
    lastVisitAt: (_db, customerId, branchIds) => {
      lastVisits.push({ customerId, branchIds });
      return Promise.resolve(
        branchIds === 'all' || branchIds.includes(FIXTURE_IDS.branches.B3)
          ? new Date('2026-10-05T10:42:00+06:30')
          : null,
      );
    },
  });
});
afterAll(() => s.close());

const match = (phone: string, name?: string) =>
  runner.run((tx) => customers.matchOrCreate(tx, { phone, name, actor_user_id: KO_AUNG }));

async function refusal(work: () => Promise<unknown>): Promise<ProblemException | undefined> {
  try {
    await work();
    return undefined;
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
}

const auditOf = (entityId: string) =>
  prisma.audit_events.findMany({
    where: { entity_type: 'customers', entity_id: entityId },
    orderBy: { occurred_at: 'asc' },
    select: { action: true, actor_user_id: true },
  });

describe('Customers.matchOrCreate (P3-RULE-01)', () => {
  it('Scenario: Returning customer attached — no new row, no warning', async () => {
    const before = await prisma.customers.count();
    const result = await match('09 7712 3456');
    expect(result).toStrictEqual({
      customer: {
        id: MA_SU,
        name: 'Ma Su',
        phone: '09 7712 3456',
        phone_normalized: '+95977123456',
        status: CustomerStatus.ACTIVE,
      },
      warnings: [],
    });
    expect(await prisma.customers.count()).toBe(before);
  });

  it('Scenario: A typed name does not rename an existing customer', async () => {
    const result = await match('+95977123456', 'Su Su');
    expect(result.customer.name).toBe('Ma Su');
    expect((await prisma.customers.findUniqueOrThrow({ where: { id: MA_SU } })).name).toBe('Ma Su');
  });

  it('Scenario: New customer created — Ko Phyo, audited, no customer.create code needed', async () => {
    const result = await match('09 4500 1122', 'Ko Phyo');
    expect(result.customer).toMatchObject({
      name: 'Ko Phyo',
      phone: '09 4500 1122',
      phone_normalized: '+95945001122',
      status: CustomerStatus.ACTIVE,
    });
    expect(result.warnings).toStrictEqual([]);
    expect(await auditOf(result.customer.id)).toStrictEqual([
      { action: 'customer.create', actor_user_id: KO_AUNG },
    ]);
  });

  it('a phone typed in Myanmar digits is stored with Western digits (AD-FMT-10)', async () => {
    const result = await match('၀၉ ၄၅၀၀ ၄၄၅၅', 'Ma Hla');
    expect([result.customer.phone, result.customer.phone_normalized]).toStrictEqual([
      '09 4500 4455',
      '+95945004455',
    ]);
  });

  it('Scenario: New phone without a name — 400 validation naming customer.name, no row', async () => {
    const error = await refusal(() => match('09 4500 9999'));
    expect([error?.code, error?.status]).toStrictEqual([ErrorCode.VALIDATION, 400]);
    expect(error?.options.errors?.map((item) => item.field)).toStrictEqual(['customer.name']);
    expect(await prisma.customers.count({ where: { phone_normalized: '+95945009999' } })).toBe(0);
  });

  it('a blank name counts as no name', async () => {
    const error = await refusal(() => match('09 4500 8888', '   '));
    expect(error?.options.errors?.[0]?.field).toBe('customer.name');
  });

  it('Scenario: Not a phone number — 400 phone_invalid', async () => {
    const error = await refusal(() => match('12', 'Nobody'));
    expect([error?.code, error?.status]).toStrictEqual([ErrorCode.PHONE_INVALID, 400]);
  });

  it('Scenario: Inactive customer returns — ACTIVE again, warning customer_reactivated', async () => {
    const created = await match('09 4500 2233', 'Ma Aye');
    await prisma.customers.update({
      where: { id: created.customer.id },
      data: { status: CustomerStatus.INACTIVE },
    });
    const result = await match('09 4500 2233');
    expect(result.customer.status).toBe(CustomerStatus.ACTIVE);
    expect(result.warnings).toStrictEqual([{ code: 'customer_reactivated' }]);
    expect((await auditOf(created.customer.id)).map((row) => row.action)).toStrictEqual([
      'customer.create',
      'customer.reactivate',
    ]);
  });

  it('Scenario: Archived customer returns — restored, warning customer_restored', async () => {
    const created = await match('09 4500 3344', 'Ko Lin');
    await prisma.customers.update({
      where: { id: created.customer.id },
      data: { archived_at: new Date(), status: CustomerStatus.INACTIVE },
    });
    const result = await match('09 4500 3344');
    expect(result.warnings).toStrictEqual([{ code: 'customer_restored' }]);
    const row = await prisma.customers.findUniqueOrThrow({ where: { id: created.customer.id } });
    expect([row.archived_at, row.status]).toStrictEqual([null, CustomerStatus.ACTIVE]);
    expect((await auditOf(created.customer.id)).map((r) => r.action)).toStrictEqual([
      'customer.create',
      'customer.restore',
    ]);
  });

  it('Scenario: Two sales, one new phone, same moment — exactly one row', async () => {
    const [one, two] = await Promise.all([
      match('09 4500 5566', 'Ko Phyo'),
      match('09 4500 5566', 'Ko Phyo'),
    ]);
    expect(one.customer.id).toBe(two.customer.id);
    expect(await prisma.customers.count({ where: { phone_normalized: '+95945005566' } })).toBe(1);
    expect((await auditOf(one.customer.id)).map((r) => r.action)).toStrictEqual([
      'customer.create',
    ]);
  });
});

describe('Customers.lookup (P3.CUS.02)', () => {
  it('Scenario: Returning customer — 09 7712 3456 → Ma Su, upcoming_bookings []', async () => {
    const result = await customers.lookup(prisma, '09 7712 3456', [FIXTURE_IDS.branches.B3]);
    expect(result).toStrictEqual({
      customer: {
        id: MA_SU,
        name: 'Ma Su',
        phone: '09 7712 3456',
        status: CustomerStatus.ACTIVE,
        notes: null,
        last_visit_at: '2026-10-05T10:42:00+06:30',
        upcoming_bookings: [],
      },
    });
    expect(lastVisits.at(-1)).toStrictEqual({
      customerId: MA_SU,
      branchIds: [FIXTURE_IDS.branches.B3],
    });
  });

  it('Scenario: Same customer, other spelling — +95977123456', async () => {
    expect((await customers.lookup(prisma, '+95977123456', 'all')).customer?.id).toBe(MA_SU);
  });

  it('Scenario: Visit at a branch outside the read scope — last_visit_at null', async () => {
    const result = await customers.lookup(prisma, '09 7712 3456', [FIXTURE_IDS.branches.B1]);
    expect(result.customer?.last_visit_at).toBeNull();
  });

  it('Scenario: First visit — an unknown phone is { customer: null }', async () => {
    expect(await customers.lookup(prisma, '09 4500 7777', 'all')).toStrictEqual({
      customer: null,
    });
  });

  it('Scenario: Archived customer — { customer: null, archived: true }', async () => {
    const created = await match('09 4500 6677', 'Ma Win');
    await prisma.customers.update({
      where: { id: created.customer.id },
      data: { archived_at: new Date() },
    });
    expect(await customers.lookup(prisma, '09 4500 6677', 'all')).toStrictEqual({
      customer: null,
      archived: true,
    });
  });

  it('Scenario: Not a phone number — 400 phone_invalid', async () => {
    const error = await refusal(() => customers.lookup(prisma, '12', 'all'));
    expect([error?.code, error?.status]).toStrictEqual([ErrorCode.PHONE_INVALID, 400]);
  });
});
