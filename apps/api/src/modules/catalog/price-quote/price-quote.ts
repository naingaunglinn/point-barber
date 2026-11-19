import { Injectable } from '@nestjs/common';
import {
  type BusinessDate,
  ErrorCode,
  LocationType,
  type Mmk,
  type PriceSource,
  type QuoteDto,
  ServicePricingMode,
  ServiceStatus,
  moneyFromWire,
  moneyToWire,
  sumMoney,
  todayMmt,
  toMmtIso,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { DayLock } from '../../cash-closing/index.js';
import { SettingsReader } from '../../platform/index.js';
import { CatalogRepository } from '../repositories/catalog.repository.js';
import { resolvePrice } from './resolve-price.js';

// The price quote — the only price calculator (P2-RULE-05 · D-SVC-04 · API-DATA-07 · add-walkin-visit-
// checkout design D12, built whole): BRANCH and HOME, the variant key, price sources 1 – 4, the
// transport fee and the block length. Sale lines call it in-process; P2.PRC.06 previews it. An item
// that cannot be sold is `sold: false` with a reason, never an error.

export type QuoteRefusal =
  | typeof ErrorCode.NOT_SOLD_HERE
  | typeof ErrorCode.VARIANT_REQUIRED
  | typeof ErrorCode.SERVICE_INACTIVE
  | typeof ErrorCode.CATEGORY_INACTIVE;

export interface QuoteInput {
  readonly branch_id: string;
  readonly location_type: number;
  readonly date: BusinessDate;
  readonly employee_id?: string | null;
  readonly items: readonly {
    readonly service_id: string;
    readonly service_variant_id?: string | null;
  }[];
}

export interface QuotedItem {
  readonly service_id: string;
  readonly service_variant_id: string | null;
  readonly sold: boolean;
  readonly reason: QuoteRefusal | null;
  readonly unit_price: Mmk | null;
  readonly duration_minutes: number | null;
  readonly buffer_minutes: number | null;
  readonly price_source: PriceSource | null;
  /** The service names, for a sale line's snapshot (not part of the Quote DTO). */
  readonly name_mm: string | null;
  readonly name_en: string | null;
}

export interface Quote {
  readonly branch_id: string;
  readonly location_type: number;
  readonly date: BusinessDate;
  readonly employee_id: string | null;
  readonly complete: boolean;
  readonly items: readonly QuotedItem[];
  readonly transport_fee: Mmk;
  /** Σ unit price of the sold items; the transport fee is separate (Part 3 subtotal + fee). */
  readonly subtotal: Mmk;
  readonly duration_minutes: number;
  /** travel + Σ duration + Σ buffer + travel; travel = home_service.travel_minutes at HOME (P2-RULE-10). */
  readonly block_minutes: number;
}

const refused = (
  item: QuoteInput['items'][number],
  reason: QuoteRefusal,
  names: { name_mm: string; name_en: string | null } | null = null,
): QuotedItem => ({
  service_id: item.service_id,
  service_variant_id: item.service_variant_id ?? null,
  sold: false,
  reason,
  unit_price: null,
  duration_minutes: null,
  buffer_minutes: null,
  price_source: null,
  name_mm: names?.name_mm ?? null,
  name_en: names?.name_en ?? null,
});

@Injectable()
export class PriceQuote {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly settings: SettingsReader,
    private readonly dayLock: DayLock,
    private readonly clock: Clock,
  ) {}

  async quote(db: Tx, input: QuoteInput): Promise<Quote> {
    const serviceIds = [...new Set(input.items.map((item) => item.service_id))];
    const [services, branchServices, prices] = await Promise.all([
      this.repository.servicesWithCategory(db, serviceIds),
      this.repository.branchServices(db, input.branch_id, serviceIds),
      this.repository.priceRows(db, input.branch_id, serviceIds),
    ]);
    const serviceOf = new Map(services.map((service) => [service.id, service]));
    const soldAt = new Map(branchServices.map((row) => [row.service_id, row]));
    const employeeId = input.employee_id ?? null;

    const items = input.items.map((item): QuotedItem => {
      const service = serviceOf.get(item.service_id);
      if (service === undefined) return refused(item, ErrorCode.NOT_SOLD_HERE);
      const names = { name_mm: service.name_mm, name_en: service.name_en };
      if (service.status !== ServiceStatus.ACTIVE || service.archived_at !== null)
        return refused(item, ErrorCode.SERVICE_INACTIVE, names);
      if (
        service.service_categories.status !== ServiceStatus.ACTIVE ||
        service.service_categories.archived_at !== null
      )
        return refused(item, ErrorCode.CATEGORY_INACTIVE, names);
      const branchService = soldAt.get(service.id);
      if (branchService?.status !== ServiceStatus.ACTIVE)
        return refused(item, ErrorCode.NOT_SOLD_HERE, names);
      const options = service.pricing_mode === ServicePricingMode.OPTIONS;
      const variantId = options ? (item.service_variant_id ?? null) : null;
      if (options && variantId === null) return refused(item, ErrorCode.VARIANT_REQUIRED, names);
      const price = resolvePrice(prices.get(service.id) ?? [], {
        date: input.date,
        location: input.location_type,
        employeeId,
        variantId,
      });
      if (price === null) return refused(item, ErrorCode.NOT_SOLD_HERE, names);
      return {
        service_id: service.id,
        service_variant_id: variantId,
        sold: true,
        reason: null,
        unit_price: price.row.price_amount as Mmk,
        duration_minutes: price.row.duration_minutes ?? branchService.duration_minutes,
        buffer_minutes: service.buffer_minutes,
        price_source: price.source,
        ...names,
      };
    });

    const home = input.location_type === LocationType.HOME;
    const settings = await this.settings.effective(
      ['home_service.transport_fee_amount', 'home_service.travel_minutes'],
      input.branch_id,
    );
    const sold = items.filter((item) => item.sold);
    const duration = sold.reduce((sum, item) => sum + (item.duration_minutes ?? 0), 0);
    const buffer = sold.reduce((sum, item) => sum + (item.buffer_minutes ?? 0), 0);
    const travel = home ? settings['home_service.travel_minutes'] : 0;
    return {
      branch_id: input.branch_id,
      location_type: input.location_type,
      date: input.date,
      employee_id: employeeId,
      complete: sold.length === items.length,
      items,
      transport_fee: moneyFromWire(home ? settings['home_service.transport_fee_amount'] : 0),
      subtotal: sumMoney(sold.map((item) => item.unit_price as Mmk)),
      duration_minutes: duration,
      block_minutes: travel + duration + buffer + travel,
    };
  }

  /**
   * The date window of P2.PRC.06 (owner B11): after today + `booking.advance_window_days` → 422
   * `outside_window`; an earlier date whose branch-day is CLOSED → 422 `day_closed` with the DayLock
   * context. Read only — no lock.
   */
  async assertQuotable(db: Tx, branchId: string, date: BusinessDate): Promise<void> {
    const today = todayMmt(this.clock.now());
    const { 'booking.advance_window_days': window } = await this.settings.effective(
      ['booking.advance_window_days'],
      branchId,
    );
    const last = new Date(`${today}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + window);
    if (date > last.toISOString().slice(0, 10))
      throw new ProblemException(ErrorCode.OUTSIDE_WINDOW, 422);
    if (date >= today) return;
    const closed = await this.dayLock.closedDay(db, branchId, date);
    if (closed === null) return;
    throw new ProblemException(ErrorCode.DAY_CLOSED, 422, {
      context: {
        branch_id: branchId,
        business_date: date,
        closed_at: toMmtIso(closed.closed_at),
        closed_by: closed.closed_by,
        correction_path: 'reopen',
      },
    });
  }
}

/** The wire form of a quote (P2.PRC.06 `Quote` — API-DATA-02: amounts through moneyToWire). */
export function toQuoteDto(quote: Quote): QuoteDto {
  return {
    branch_id: quote.branch_id,
    location_type: quote.location_type as QuoteDto['location_type'],
    date: quote.date,
    employee_id: quote.employee_id,
    complete: quote.complete,
    items: quote.items.map((item) => ({
      service_id: item.service_id,
      service_variant_id: item.service_variant_id,
      sold: item.sold,
      reason: item.reason,
      unit_price_amount: item.unit_price === null ? null : moneyToWire(item.unit_price),
      duration_minutes: item.duration_minutes,
      buffer_minutes: item.buffer_minutes,
      price_source: item.price_source,
    })),
    transport_fee_amount: moneyToWire(quote.transport_fee),
    subtotal_amount: moneyToWire(quote.subtotal),
    duration_minutes: quote.duration_minutes,
    block_minutes: quote.block_minutes,
  };
}
