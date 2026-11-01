import { randomUUID } from 'node:crypto';

import { AuditSource, CustomerStatus, SaleStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 13.1 / 8.6 over HTTP — customers spec "The Finish step looks a customer up
// by phone" through POST /v1/sales/{id}/finish with its @Audited declaration (API-AUD-01 · P3-RULE-01):
// a new customer (Ko Phyo, `09 4500 1122`), an archived one restored and an inactive one reactivated each
// write their customer audit row next to `sale.finish` — the e2e run of 22/Oct answered 500 for Ko Phyo
// because the endpoint did not declare `customer.create`. 05/Oct/2026 at B3; Ko Aung's Haircut 10,000.
const { services } = FIXTURE_IDS;
const AUNG = 'E004';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
});
afterAll(() => s.close());

/** A paid, completed walk-in of Ko Aung ready for FINISH. */
async function paidSale(): Promise<string> {
  const visit = await api.start(AUNG, [services.HAIRCUT]);
  await api.complete(AUNG, visit.id);
  await api.pay(AUNG, visit.sale.id, { payment_method_id: cash, amount: 10_000 });
  return visit.sale.id;
}

const appAudit = (action: string, entityId: string) =>
  prisma.audit_events.count({ where: { action, entity_id: entityId, source: AuditSource.APP } });

describe('FINISH with a customer (P4.SAL.10 · P3-RULE-01)', () => {
  it('Scenario: a new customer — Ko Phyo is created; customer.create and sale.finish are audited', async () => {
    const saleId = await paidSale();
    const sale = await api.finish(AUNG, saleId, {
      expected_total_amount: 10_000,
      customer: { phone: '09 4500 1122', name: 'Ko Phyo' },
    });
    expect(sale).toMatchObject({ status: SaleStatus.FINISHED, customer: { name: 'Ko Phyo' } });
    const customerId = sale.customer?.id ?? '';
    expect(await appAudit('customer.create', customerId)).toBe(1);
    expect(await appAudit('sale.finish', saleId)).toBe(1);
  });

  it('an archived customer is restored, an inactive one reactivated — each audited', async () => {
    const company = await prisma.companies.findFirstOrThrow();
    const archived = randomUUID();
    const inactive = randomUUID();
    await prisma.customers.createMany({
      data: [
        {
          id: archived,
          company_id: company.id,
          name: 'Ma Win',
          phone: '09 4500 6677',
          phone_normalized: '+95945006677',
          status: CustomerStatus.ACTIVE,
          archived_at: new Date('2026-09-01T00:00:00Z'),
        },
        {
          id: inactive,
          company_id: company.id,
          name: 'Ko Lin',
          phone: '09 4500 8899',
          phone_normalized: '+95945008899',
          status: CustomerStatus.INACTIVE,
        },
      ],
    });
    for (const [phone, id, action] of [
      ['09 4500 6677', archived, 'customer.restore'],
      ['09 4500 8899', inactive, 'customer.reactivate'],
    ] as const) {
      const sale = await api.finish(AUNG, await paidSale(), {
        expected_total_amount: 10_000,
        customer: { phone },
      });
      expect(sale.customer?.id).toBe(id);
      expect(await appAudit(action, id)).toBe(1);
    }
  });
});
