import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { PriceRow } from '../price-quote/resolve-price.js';

// The catalogue reads of the price quote and the eligibility check (Part 2 — the catalog module owns
// services, categories, branch_services, service_prices and employee_service_eligibilities). This
// change only reads them; the management screens come with add-service-catalogue / -prices.

export interface QuoteService {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly pricing_mode: number;
  readonly buffer_minutes: number;
  readonly status: number;
  readonly archived_at: Date | null;
  readonly service_categories: { readonly status: number; readonly archived_at: Date | null };
}

export interface BranchServiceRow {
  readonly service_id: string;
  readonly duration_minutes: number;
  readonly status: number;
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const day = (date: string): Date => new Date(`${date}T00:00:00Z`);

@Injectable()
export class CatalogRepository {
  servicesWithCategory(db: Tx, serviceIds: readonly string[]): Promise<QuoteService[]> {
    return db.services.findMany({
      where: { id: { in: [...serviceIds] } },
      select: {
        id: true,
        name_mm: true,
        name_en: true,
        pricing_mode: true,
        buffer_minutes: true,
        status: true,
        archived_at: true,
        service_categories: { select: { status: true, archived_at: true } },
      },
    });
  }

  branchServices(
    db: Tx,
    branchId: string,
    serviceIds: readonly string[],
  ): Promise<BranchServiceRow[]> {
    return db.branch_services.findMany({
      where: { branch_id: branchId, service_id: { in: [...serviceIds] } },
      select: { service_id: true, duration_minutes: true, status: true },
    });
  }

  /** The non-archived price rows of the services at the branch, keyed by service id. */
  async priceRows(
    db: Tx,
    branchId: string,
    serviceIds: readonly string[],
  ): Promise<Map<string, PriceRow[]>> {
    const rows = await db.service_prices.findMany({
      where: { branch_id: branchId, service_id: { in: [...serviceIds] }, archived_at: null },
      select: {
        id: true,
        service_id: true,
        service_variant_id: true,
        location_type: true,
        employee_id: true,
        price_amount: true,
        duration_minutes: true,
        effective_from: true,
        effective_to: true,
      },
    });
    const byService = new Map<string, PriceRow[]>();
    for (const { service_id, effective_from, effective_to, ...row } of rows) {
      const list = byService.get(service_id) ?? [];
      list.push({
        ...row,
        effective_from: isoDate(effective_from),
        effective_to: effective_to === null ? null : isoDate(effective_to),
      });
      byService.set(service_id, list);
    }
    return byService;
  }

  /** A non-archived eligibility row of (employee, branch, service) effective on `date`. */
  async hasEligibility(
    db: Tx,
    key: { employee_id: string; branch_id: string; service_id: string; date: string },
  ): Promise<boolean> {
    const row = await db.employee_service_eligibilities.findFirst({
      where: {
        employee_id: key.employee_id,
        branch_id: key.branch_id,
        service_id: key.service_id,
        archived_at: null,
        effective_from: { lte: day(key.date) },
        OR: [{ effective_to: null }, { effective_to: { gte: day(key.date) } }],
      },
      select: { id: true },
    });
    return row !== null;
  }
}
