import { randomUUID } from 'node:crypto';

import {
  DailyClosingStatus,
  ErrorCode,
  LocationType,
  PriceSource,
  ServicePricingMode,
  ServiceStatus,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Eligibility, PriceQuote, toQuoteDto } from '../src/modules/catalog/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout tasks 4.1 – 4.3 (service part) — services-pricing spec "The price quote is
// the only price calculator" (P2-RULE-03 / 05 / 06 · D-SVC-03 / 04 / 06 / 08) on the fixture data:
// B3 Haircut 8,000 (30 min), Shave 3,000 (15 min), Ko Aung's own Haircut 10,000. Today is
// 05/Oct/2026 10:00 AM MMT. The HTTP endpoint P2.PRC.06 is wired with the access guards.
const { branches, employees, services } = FIXTURE_IDS;
const B3 = branches.B3;
const KO_AUNG = employees.E004;
const KO_MIN = employees.E005;

let s: SeededApp;
let prisma: PrismaService;
let quotes: PriceQuote;
let eligibility: Eligibility;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  prisma = s.app.get(PrismaService);
  quotes = s.app.get(PriceQuote);
  eligibility = s.app.get(Eligibility);
});
afterAll(() => s.close());

const quote = (
  items: { service_id: string; service_variant_id?: string | null }[],
  over: {
    date?: string;
    employee_id?: string | null;
    location_type?: number;
    branch_id?: string;
  } = {},
) =>
  quotes.quote(prisma, {
    branch_id: over.branch_id ?? B3,
    location_type: over.location_type ?? LocationType.BRANCH,
    date: over.date ?? '2026-10-05',
    employee_id: over.employee_id === undefined ? KO_MIN : over.employee_id,
    items,
  });

describe('PriceQuote.quote (P2-RULE-05)', () => {
  it('Scenario: Branch price — Ko Min, Haircut 8,000, 30 min, price_source 1', async () => {
    const dto = toQuoteDto(await quote([{ service_id: services.HAIRCUT }]));
    expect(dto.items).toStrictEqual([
      {
        service_id: services.HAIRCUT,
        service_variant_id: null,
        sold: true,
        reason: null,
        unit_price_amount: 8000,
        duration_minutes: 30,
        buffer_minutes: 0,
        price_source: PriceSource.BRANCH,
      },
    ]);
    expect(dto).toMatchObject({ complete: true, subtotal_amount: 8000, transport_fee_amount: 0 });
  });

  it('Scenario: Barber price — Ko Aung, Haircut 10,000, price_source 2', async () => {
    const [item] = (await quote([{ service_id: services.HAIRCUT }], { employee_id: KO_AUNG }))
      .items;
    expect([item?.unit_price, item?.price_source]).toStrictEqual([
      10000n,
      PriceSource.BARBER_OVERRIDE,
    ]);
  });

  it('Scenario: Two items — 8,000 + 3,000 = 11,000, complete', async () => {
    const dto = toQuoteDto(
      await quote([{ service_id: services.HAIRCUT }, { service_id: services.SHAVE }]),
    );
    expect(dto.items.map((item) => item.unit_price_amount)).toStrictEqual([8000, 3000]);
    expect(dto).toMatchObject({
      subtotal_amount: 11000,
      complete: true,
      duration_minutes: 45,
      block_minutes: 45,
    });
  });

  it('Scenario: An open past day — 04/Oct, Haircut 8,000 for Ko Min', async () => {
    const [item] = (await quote([{ service_id: services.HAIRCUT }], { date: '2026-10-04' })).items;
    expect(item?.unit_price).toBe(8000n);
  });

  it('Scenario: Home price falls back to the branch price — Ko Aung at home 8,000, source 4, fee 0', async () => {
    const dto = toQuoteDto(
      await quote([{ service_id: services.HAIRCUT }], {
        employee_id: KO_AUNG,
        location_type: LocationType.HOME,
      }),
    );
    expect(dto.items[0]).toMatchObject({
      unit_price_amount: 8000,
      price_source: PriceSource.HOME_FALLBACK_BRANCH,
    });
    // travel 30 + Haircut 30 + buffer 0 + travel 30 (home_service.travel_minutes — D-SCH-03).
    expect(dto).toMatchObject({ transport_fee_amount: 0, block_minutes: 90 });
  });

  it('an unknown service is not sold here', async () => {
    const dto = toQuoteDto(await quote([{ service_id: randomUUID() }]));
    expect(dto.items[0]).toMatchObject({ sold: false, reason: ErrorCode.NOT_SOLD_HERE });
    expect(dto.complete).toBe(false);
  });
});

describe('PriceQuote.quote — refusals as data (sold: false)', () => {
  it('Scenario: Not sold here — Hair wash switched off at B3; still sold at B1', async () => {
    await prisma.branch_services.updateMany({
      where: { branch_id: B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.INACTIVE },
    });
    const dto = toQuoteDto(
      await quote([{ service_id: services.HAIRCUT }, { service_id: services.HAIR_WASH }]),
    );
    expect(dto.items[1]).toMatchObject({
      sold: false,
      reason: ErrorCode.NOT_SOLD_HERE,
      unit_price_amount: null,
    });
    // The sold item still counts; the quote is not complete (status 200 at the endpoint).
    expect(dto).toMatchObject({ complete: false, subtotal_amount: 8000 });
    const b1 = await quote([{ service_id: services.HAIR_WASH }], {
      branch_id: branches.B1,
      employee_id: null,
    });
    expect(b1.items[0]?.unit_price).toBe(2000n);
    await prisma.branch_services.updateMany({
      where: { branch_id: B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.ACTIVE },
    });
  });

  it('an inactive service → service_inactive; an inactive category → category_inactive', async () => {
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect((await quote([{ service_id: services.SHAVE }])).items[0]?.reason).toBe(
      ErrorCode.SERVICE_INACTIVE,
    );
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.ACTIVE },
    });
    await prisma.service_categories.update({
      where: { id: FIXTURE_IDS.serviceCategories.SERVICES },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect((await quote([{ service_id: services.SHAVE }])).items[0]?.reason).toBe(
      ErrorCode.CATEGORY_INACTIVE,
    );
    await prisma.service_categories.update({
      where: { id: FIXTURE_IDS.serviceCategories.SERVICES },
      data: { status: ServiceStatus.ACTIVE },
    });
  });

  it('an option service without a variant → variant_required', async () => {
    const id = randomUUID();
    const company = await prisma.companies.findFirstOrThrow();
    await prisma.services.create({
      data: {
        id,
        company_id: company.id,
        category_id: FIXTURE_IDS.serviceCategories.SERVICES,
        name_mm: 'ဆံပင်ဆိုးခြင်း',
        name_en: 'Hair colour',
        pricing_mode: ServicePricingMode.OPTIONS,
      },
    });
    await prisma.branch_services.create({
      data: { id: randomUUID(), branch_id: B3, service_id: id, duration_minutes: 60 },
    });
    const dto = toQuoteDto(await quote([{ service_id: id }]));
    expect(dto.items[0]).toMatchObject({ sold: false, reason: ErrorCode.VARIANT_REQUIRED });
  });
});

describe('PriceQuote.quote — a scheduled price', () => {
  it('Scenario: Price scheduled for tomorrow — 8,000 on 05/Oct, 9,000 from 06/Oct', async () => {
    const current = await prisma.service_prices.findFirstOrThrow({
      where: { branch_id: B3, service_id: services.HAIRCUT, employee_id: null },
    });
    const scheduled = randomUUID();
    await prisma.service_prices.update({
      where: { id: current.id },
      data: { effective_to: new Date('2026-10-05T00:00:00Z') },
    });
    await prisma.service_prices.create({
      data: {
        id: scheduled,
        branch_id: B3,
        service_id: services.HAIRCUT,
        location_type: LocationType.BRANCH,
        price_amount: 9000n,
        effective_from: new Date('2026-10-06T00:00:00Z'),
      },
    });
    try {
      expect((await quote([{ service_id: services.HAIRCUT }])).items[0]?.unit_price).toBe(8000n);
      expect(
        (await quote([{ service_id: services.HAIRCUT }], { date: '2026-10-06' })).items[0]
          ?.unit_price,
      ).toBe(9000n);
    } finally {
      // The fixture price is put back for the tests after this one (review of #20).
      await prisma.service_prices.delete({ where: { id: scheduled } });
      await prisma.service_prices.update({
        where: { id: current.id },
        data: { effective_to: current.effective_to },
      });
    }
  });
});

describe('PriceQuote.assertQuotable — the date window of P2.PRC.06', () => {
  const refusal = async (date: string): Promise<ProblemException | undefined> => {
    try {
      await quotes.assertQuotable(prisma, B3, date);
      return undefined;
    } catch (error) {
      if (error instanceof ProblemException) return error;
      throw error;
    }
  };

  it('Scenario: Last day inside the window — 19/Oct (today + 14) passes', async () => {
    expect(await refusal('2026-10-19')).toBeUndefined();
  });

  it('Scenario: One day past the window — 20/Oct → 422 outside_window', async () => {
    const error = await refusal('2026-10-20');
    expect([error?.code, error?.status]).toStrictEqual([ErrorCode.OUTSIDE_WINDOW, 422]);
  });

  it('Scenario: An open past day — 04/Oct without a closing passes', async () => {
    expect(await refusal('2026-10-04')).toBeUndefined();
  });

  it('Scenario: A closed past day — 04/Oct CLOSED → 422 day_closed, correction_path reopen', async () => {
    const closing = randomUUID();
    await prisma.daily_closings.create({
      data: {
        id: closing,
        branch_id: B3,
        business_date: new Date('2026-10-04T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-04T21:05:00+06:30'),
        closed_by_user_id: FIXTURE_IDS.users.E002,
      },
    });
    try {
      const error = await refusal('2026-10-04');
      expect([error?.code, error?.status]).toStrictEqual([ErrorCode.DAY_CLOSED, 422]);
      expect(error?.options.context).toMatchObject({
        business_date: '2026-10-04',
        correction_path: 'reopen',
      });
    } finally {
      await prisma.daily_closings.delete({ where: { id: closing } });
    }
  });
});

describe('Eligibility.isEligible (P2-RULE-06)', () => {
  it('Ko Aung may do Haircut at B3 from 01/Sep/2026 (fixture 070), not before', async () => {
    const key = { employee_id: KO_AUNG, branch_id: B3, service_id: services.HAIRCUT };
    expect(await eligibility.isEligible(prisma, { ...key, date: '2026-10-05' })).toBe(true);
    expect(await eligibility.isEligible(prisma, { ...key, date: '2026-08-31' })).toBe(false);
  });

  it('not at another branch', async () => {
    expect(
      await eligibility.isEligible(prisma, {
        employee_id: KO_AUNG,
        branch_id: branches.B1,
        service_id: services.HAIRCUT,
        date: '2026-10-05',
      }),
    ).toBe(false);
  });
});
