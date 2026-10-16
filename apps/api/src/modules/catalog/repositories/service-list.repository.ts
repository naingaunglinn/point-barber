import { Injectable } from '@nestjs/common';
import { ServiceStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The operational reads of the POS (P2.SVC.01 · P2.CAT.01 — the catalog module owns the tables):
// ACTIVE services in catalogue order, with where they are sold and the price rows of today.

export interface ServiceListRow {
  readonly id: string;
  readonly category_id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly pricing_mode: number;
  readonly buffer_minutes: number;
  readonly status: number;
  readonly show_on_website: boolean;
  readonly sort_order: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
  readonly branch_services: readonly { branch_id: string; duration_minutes: number }[];
  readonly service_prices: readonly {
    branch_id: string;
    service_variant_id: string | null;
    employee_id: string | null;
    location_type: number;
    duration_minutes: number | null;
  }[];
}

export interface ServiceListFilter {
  readonly branch_id?: string;
  readonly category_id?: string;
  readonly pricing_mode?: number;
  readonly q?: string;
  /** The price rows effective on this Myanmar date are read (`unpriced_branch_ids`). */
  readonly today: string;
  readonly after?: string;
  readonly take: number;
}

@Injectable()
export class ServiceListRepository {
  services(db: Tx, filter: ServiceListFilter): Promise<ServiceListRow[]> {
    const day = new Date(`${filter.today}T00:00:00Z`);
    const text = filter.q?.trim();
    return db.services.findMany({
      where: {
        status: ServiceStatus.ACTIVE,
        archived_at: null,
        ...(filter.category_id === undefined ? {} : { category_id: filter.category_id }),
        ...(filter.pricing_mode === undefined ? {} : { pricing_mode: filter.pricing_mode }),
        ...(filter.branch_id === undefined
          ? {}
          : {
              branch_services: {
                some: { branch_id: filter.branch_id, status: ServiceStatus.ACTIVE },
              },
            }),
        ...(text === undefined || text === ''
          ? {}
          : {
              OR: [
                { name_mm: { contains: text, mode: 'insensitive' as const } },
                { name_en: { contains: text, mode: 'insensitive' as const } },
              ],
            }),
      },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      ...(filter.after === undefined ? {} : { cursor: { id: filter.after }, skip: 1 }),
      take: filter.take,
      select: {
        id: true,
        category_id: true,
        name_mm: true,
        name_en: true,
        pricing_mode: true,
        buffer_minutes: true,
        status: true,
        show_on_website: true,
        sort_order: true,
        archived_at: true,
        updated_at: true,
        branch_services: {
          where: { status: ServiceStatus.ACTIVE },
          select: { branch_id: true, duration_minutes: true },
          orderBy: { branch_id: 'asc' },
        },
        service_prices: {
          where: {
            archived_at: null,
            effective_from: { lte: day },
            OR: [{ effective_to: null }, { effective_to: { gte: day } }],
          },
          select: {
            branch_id: true,
            service_variant_id: true,
            employee_id: true,
            location_type: true,
            duration_minutes: true,
          },
        },
      },
    });
  }

  categories(db: Tx) {
    return db.service_categories.findMany({
      where: { status: ServiceStatus.ACTIVE, archived_at: null },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name_mm: true,
        name_en: true,
        sort_order: true,
        status: true,
        archived_at: true,
        updated_at: true,
      },
    });
  }
}
