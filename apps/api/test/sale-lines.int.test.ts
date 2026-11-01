import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  LocationType,
  SaleStatus,
  ServiceStatus,
  VisitStatus,
  saleItemCreateSchema,
  saleSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Visits } from '../src/modules/delivery/index.js';
import { SaleLines, SaleView } from '../src/modules/sales/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type FixturePerson, KO_AUNG, KO_MIN, MA_HNIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 6.3, 6.13 – 6.17 (service part) — visits spec "Service lines are
// priced by the server and snapshotted", "A service outside the barber's eligibility…", "Removing a
// line, or adding one after COMPLETE, needs a reason", "COMPLETE needs at least one service" and
// "INCOMPLETE closes a visit that will not be paid" (P4.SAL.04 / 06 · P4.VIS.05 / 06 · P4-RULE-04 /
// 05 / 11). Each test starts its own visit, so they run independently. Today is 05/Oct/2026.
const { branches, services, employees, users } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let visits: Visits;
let lines: SaleLines;
let saleView: SaleView;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:40:00+06:30'));
  prisma = s.app.get(PrismaService);
  visits = s.app.get(Visits);
  lines = s.app.get(SaleLines);
  saleView = s.app.get(SaleView);
});
afterAll(() => s.close());

async function refusal(work: () => Promise<unknown>): Promise<ProblemException> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

/** A new walk-in of `who` at B3, with its sale id. */
async function walkIn(who: FixturePerson, items: string[] = []) {
  const { visit } = await as(who, () =>
    visits.start(
      who.viewer,
      who.scope,
      { branch_id: branches.B3, items: items.map((service_id) => ({ service_id })) },
      randomUUID(),
    ),
  );
  return { visitId: visit.id, saleId: visit.sale.id };
}

const add = (who: FixturePerson, saleId: string, body: Record<string, unknown>) =>
  as(who, () => lines.add(who.viewer.actor, saleId, saleItemCreateSchema.parse(body)));
const remove = (who: FixturePerson, saleId: string, itemId: string, reason: string | null) =>
  as(who, () => lines.remove(who.viewer.actor, saleId, itemId, reason));
const sale = async (who: FixturePerson, saleId: string) => {
  const dto = await saleView.build(prisma, saleId, who.viewer);
  if (dto === null) throw new Error('no sale');
  return saleSchema.parse(dto);
};
const haircut = { line_type: 1, service_id: services.HAIRCUT };

describe('Service lines are priced by the server and snapshotted (P4.SAL.04)', () => {
  it('Scenario: Branch price for Ko Min — 8,000, quantity 1, performed by Ko Min', async () => {
    const { saleId } = await walkIn(KO_MIN);
    const { warnings } = await add(KO_MIN, saleId, haircut);
    expect(warnings).toStrictEqual([]);
    const [line] = (await sale(KO_MIN, saleId)).items;
    expect(line).toMatchObject({
      list_price_amount: 8000,
      unit_price_amount: 8000,
      quantity: 1,
      performed_by: { id: employees.E005 },
      description_en: 'Haircut',
      line_total_amount: 8000,
    });
  });

  it('Scenario: Barber price for Ko Aung — 10,000', async () => {
    const { saleId } = await walkIn(KO_AUNG);
    await add(KO_AUNG, saleId, haircut);
    expect((await sale(KO_AUNG, saleId)).items[0]?.unit_price_amount).toBe(10000);
  });

  it('Scenario: Second service — Shave 3,000, total 11,000 (8,000 + 3,000)', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    await add(KO_MIN, saleId, { line_type: 1, service_id: services.SHAVE });
    const dto = await sale(KO_MIN, saleId);
    expect(dto.items.map((item) => item.unit_price_amount)).toStrictEqual([8000, 3000]);
    expect([dto.subtotal_amount, dto.total_amount, dto.remaining_amount]).toStrictEqual([
      11000, 11000, 11000,
    ]);
  });

  it('Scenario: A price sent by the client has no effect — stored 8,000', async () => {
    const { saleId } = await walkIn(KO_MIN);
    await add(KO_MIN, saleId, { ...haircut, unit_price_amount: 1 });
    expect((await sale(KO_MIN, saleId)).items[0]?.unit_price_amount).toBe(8000);
  });

  it('Scenario: The snapshot survives a later price change', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    await prisma.service_prices.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIRCUT, employee_id: null },
      data: { price_amount: 9000n },
    });
    await prisma.services.update({ where: { id: services.HAIRCUT }, data: { name_en: 'Cut' } });
    const dto = await sale(KO_MIN, saleId);
    expect([
      dto.items[0]?.unit_price_amount,
      dto.items[0]?.description_en,
      dto.total_amount,
    ]).toStrictEqual([8000, 'Haircut', 8000]);
    await prisma.service_prices.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIRCUT, employee_id: null },
      data: { price_amount: 8000n },
    });
    await prisma.services.update({ where: { id: services.HAIRCUT }, data: { name_en: 'Haircut' } });
  });

  it('Scenario: Service not sold at this branch — 422 not_sold_here, no line', async () => {
    const { saleId } = await walkIn(KO_MIN);
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.INACTIVE },
    });
    const error = await refusal(() =>
      add(KO_MIN, saleId, { line_type: 1, service_id: services.HAIR_WASH }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.NOT_SOLD_HERE, 422]);
    expect((await sale(KO_MIN, saleId)).items).toStrictEqual([]);
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.ACTIVE },
    });
  });
});

describe('a line refused by the quote', () => {
  it('an inactive service — 422 service_inactive, no line', async () => {
    const { saleId } = await walkIn(KO_MIN);
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.INACTIVE },
    });
    const error = await refusal(() =>
      add(KO_MIN, saleId, { line_type: 1, service_id: services.SHAVE }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.SERVICE_INACTIVE, 422]);
    expect((await sale(KO_MIN, saleId)).items).toStrictEqual([]);
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.ACTIVE },
    });
  });
});

describe('the audit trail of the lines (API-AUD-01 · P4-RULE-21 · D-AUD-02)', () => {
  it('one sale.item_add and one sale.item_remove app row; trigger rows on sales and sale_items', async () => {
    const { saleId } = await walkIn(KO_MIN);
    await add(KO_MIN, saleId, haircut);
    const line = (await sale(KO_MIN, saleId)).items[0];
    await remove(KO_MIN, saleId, line?.id ?? '', 'Wrong service');
    // Removing a removed line changes nothing and writes no row.
    await remove(KO_MIN, saleId, line?.id ?? '', 'Wrong service');
    const app = await prisma.audit_events.findMany({
      where: { entity_type: 'sales', entity_id: saleId, source: 1 },
      select: { action: true, actor_user_id: true, reason: true },
    });
    // The clock is fixed, so both rows share occurred_at: compare them in name order.
    expect(app.sort((a, b) => a.action.localeCompare(b.action))).toStrictEqual([
      { action: 'sale.item_add', actor_user_id: users.E005, reason: null },
      { action: 'sale.item_remove', actor_user_id: users.E005, reason: 'Wrong service' },
    ]);
    const triggers = await prisma.audit_events.groupBy({
      by: ['entity_type'],
      where: { source: 2, entity_type: { in: ['sales', 'sale_items'] } },
      _count: true,
    });
    expect(triggers.map((row) => row.entity_type).sort()).toStrictEqual(['sale_items', 'sales']);
  });
});

describe('A service outside the eligibility is recorded with a warning (P2-RULE-06)', () => {
  it('Scenario: Not eligible, still recorded — Shave at 3,000 with not_eligible', async () => {
    const { saleId } = await walkIn(KO_MIN);
    const row = await prisma.employee_service_eligibilities.findFirstOrThrow({
      where: { employee_id: employees.E005, branch_id: branches.B3, service_id: services.SHAVE },
    });
    await prisma.employee_service_eligibilities.update({
      where: { id: row.id },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const { warnings } = await add(KO_MIN, saleId, { line_type: 1, service_id: services.SHAVE });
    expect(warnings).toStrictEqual([
      { code: 'not_eligible', params: { service_id: services.SHAVE } },
    ]);
    expect((await sale(KO_MIN, saleId)).items[0]?.unit_price_amount).toBe(3000);
    await prisma.employee_service_eligibilities.update({
      where: { id: row.id },
      data: { effective_to: null },
    });
  });
});

describe('Removing a line, or adding one after COMPLETE, needs a reason (P4.SAL.06)', () => {
  it('Scenario: Remove a line with a reason — the row stays, total 13,000 (10,000 + 3,000)', async () => {
    const { saleId } = await walkIn(KO_AUNG, [
      services.HAIRCUT,
      services.SHAVE,
      services.HAIR_WASH,
    ]);
    expect((await sale(KO_AUNG, saleId)).total_amount).toBe(15000);
    const hairWash = (await sale(KO_AUNG, saleId)).items[2];
    await remove(KO_AUNG, saleId, hairWash?.id ?? '', 'Customer changed his mind');
    const dto = await sale(KO_AUNG, saleId);
    expect(dto.items[2]).toMatchObject({
      removed_by: { user_id: users.E004 },
      removed_reason: 'Customer changed his mind',
    });
    expect(dto.items[2]?.removed_at).not.toBeNull();
    expect(dto.total_amount).toBe(13000);
  });

  it('Scenario: Remove without a reason — 400 reason_required, the line stays', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const line = (await sale(KO_MIN, saleId)).items[0];
    for (const reason of ['', '   ', null]) {
      const error = await refusal(() => remove(KO_MIN, saleId, line?.id ?? '', reason));
      expect([error.code, error.status]).toStrictEqual([ErrorCode.REASON_REQUIRED, 400]);
    }
    expect((await sale(KO_MIN, saleId)).items[0]?.removed_at).toBeNull();
  });

  it('Scenario: Reason at the length limit — 1,000 characters stored unchanged', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const line = (await sale(KO_MIN, saleId)).items[0];
    const reason = 'က'.repeat(1000);
    await remove(KO_MIN, saleId, line?.id ?? '', reason);
    expect((await sale(KO_MIN, saleId)).items[0]?.removed_reason).toBe(reason);
  });

  it('Scenario: The last service of a completed visit cannot be removed — 422 service_required', async () => {
    const { visitId, saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    await as(KO_MIN, () => visits.complete(KO_MIN.viewer, visitId));
    const line = (await sale(KO_MIN, saleId)).items[0];
    const error = await refusal(() => remove(KO_MIN, saleId, line?.id ?? '', 'Wrong service'));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.SERVICE_REQUIRED, 422]);
    expect((await sale(KO_MIN, saleId)).items[0]?.removed_at).toBeNull();
    // A COMPLETED unpaid visit blocks Ko Min's next START (P4-RULE-02) — close it.
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Test clean-up'));
  });

  it('Scenario: Service added after "Service done" — with a reason, total 11,000', async () => {
    const { visitId, saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    await as(KO_MIN, () => visits.complete(KO_MIN.viewer, visitId));
    const missing = await refusal(() =>
      add(KO_MIN, saleId, { line_type: 1, service_id: services.SHAVE }),
    );
    expect([missing.code, missing.status]).toStrictEqual([ErrorCode.REASON_REQUIRED, 400]);
    expect((await sale(KO_MIN, saleId)).total_amount).toBe(8000);
    await add(KO_MIN, saleId, {
      line_type: 1,
      service_id: services.SHAVE,
      added_reason: 'Customer asked for a shave at the counter',
    });
    const dto = await sale(KO_MIN, saleId);
    expect(dto.items[1]?.added_reason).toBe('Customer asked for a shave at the counter');
    expect(dto.total_amount).toBe(11000);
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Test clean-up'));
  });

  it('a line on a CANCELLED sale — 409 invalid_transition with status 0 and no path', async () => {
    const { visitId, saleId } = await walkIn(KO_MIN);
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'));
    const error = await refusal(() => add(KO_MIN, saleId, haircut));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
  });
});

describe('COMPLETE needs at least one service (P4.VIS.05)', () => {
  it('Scenario: No service yet — 422 service_required, still STARTED', async () => {
    const { visitId } = await walkIn(KO_MIN);
    const error = await refusal(() => as(KO_MIN, () => visits.complete(KO_MIN.viewer, visitId)));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.SERVICE_REQUIRED, 422]);
  });

  it('Scenario: Only a removed line — 422 service_required', async () => {
    const { visitId, saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const line = (await sale(KO_MIN, saleId)).items[0];
    await remove(KO_MIN, saleId, line?.id ?? '', 'Wrong service');
    const error = await refusal(() => as(KO_MIN, () => visits.complete(KO_MIN.viewer, visitId)));
    expect(error.code).toBe(ErrorCode.SERVICE_REQUIRED);
  });

  it('Scenario: Service done, then Repeat — status 2 at 10:40 AM, the repeat changes nothing', async () => {
    const { visitId } = await walkIn(KO_AUNG, [services.HAIRCUT]);
    const done = await as(KO_AUNG, () => visits.complete(KO_AUNG.viewer, visitId));
    expect(done).toMatchObject({
      status: VisitStatus.COMPLETED,
      completed_at: '2026-10-05T10:40:00+06:30',
      completed_by: { user_id: users.E004 },
    });
    expect(done.sale.actions).toMatchObject({ finish: true, finish_needs_reason: false });
    const again = await as(KO_AUNG, () => visits.complete(KO_AUNG.viewer, visitId));
    expect(again.completed_at).toBe('2026-10-05T10:40:00+06:30');
    const audit = await prisma.audit_events.count({
      where: { entity_id: visitId, action: 'visit.complete' },
    });
    expect(audit).toBe(1);
    // Ko Aung is now blocked until this sale is finished or the visit is marked incomplete.
    await as(KO_AUNG, () => visits.incomplete(KO_AUNG.viewer, visitId, 'Test clean-up'));
  });
});

describe('COMPLETE on a final visit', () => {
  it('an INCOMPLETE visit — 409 invalid_transition with status 0', async () => {
    const { visitId } = await walkIn(KO_MIN);
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'));
    const error = await refusal(() => as(KO_MIN, () => visits.complete(KO_MIN.viewer, visitId)));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: VisitStatus.INCOMPLETE },
    ]);
  });
});

describe('INCOMPLETE closes a visit that will not be paid (P4.VIS.06)', () => {
  it('Scenario: Started by mistake — visit 0, sale 0 with cancelled_at, no receipt number', async () => {
    const { visitId } = await walkIn(KO_MIN);
    const visit = await as(KO_MIN, () =>
      visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'),
    );
    expect(visit).toMatchObject({
      status: VisitStatus.INCOMPLETE,
      incomplete_reason: 'Started by mistake',
      incomplete_by: { user_id: users.E005 },
    });
    expect(visit.sale).toMatchObject({ status: SaleStatus.CANCELLED, receipt_number: null });
    expect(visit.sale.cancelled_at).not.toBeNull();
    // A repeat changes nothing and writes no second audit row.
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'));
    expect(
      await prisma.audit_events.count({
        where: { entity_id: visitId, action: 'visit.incomplete' },
      }),
    ).toBe(1);
  });

  it('Scenario: No reason — 400 reason_required', async () => {
    const { visitId } = await walkIn(KO_MIN);
    const error = await refusal(() =>
      as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, '')),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.REASON_REQUIRED, 400]);
  });

  it('Scenario: Payment still on the sale — 422 payments_exist, nothing changes', async () => {
    const { visitId, saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const cash = await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } });
    await prisma.payments.create({
      data: {
        id: randomUUID(),
        client_request_id: randomUUID(),
        sale_id: saleId,
        payment_method_id: cash.id,
        amount: 5000n,
        collected_by_employee_id: employees.E005,
        received_at: new Date('2026-10-05T10:39:00+06:30'),
        recorded_by_user_id: users.E005,
      },
    });
    const error = await refusal(() =>
      as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Customer left')),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.PAYMENTS_EXIST, 422]);
    const dto = await sale(KO_MIN, saleId);
    expect([dto.status, dto.paid_amount, dto.remaining_amount]).toStrictEqual([
      SaleStatus.OPEN,
      5000,
      3000,
    ]);
  });

  it('Scenario: The branch manager closes an abandoned visit — incomplete_by Ma Hnin', async () => {
    const { visitId } = await walkIn(KO_AUNG, [services.HAIRCUT]);
    await as(KO_AUNG, () => visits.complete(KO_AUNG.viewer, visitId));
    const visit = await as(MA_HNIN, () =>
      visits.incomplete(MA_HNIN.viewer, visitId, 'Barber left, customer did not pay'),
    );
    expect(visit).toMatchObject({ status: 0, incomplete_by: { user_id: users.E002 } });
  });
});

describe('the location of a walk-in line', () => {
  it('is the branch (location 1) at the visit date', async () => {
    const { visitId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const row = await prisma.visits.findUniqueOrThrow({ where: { id: visitId } });
    expect(row.location_type).toBe(LocationType.BRANCH);
  });
});
