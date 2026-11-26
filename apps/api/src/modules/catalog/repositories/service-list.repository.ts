import { Injectable } from '@nestjs/common';
import { ServiceCategoryStatus, ServiceStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { likeText } from '../../../common/database/like-text.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

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
  readonly branch_services: readonly {
    branch_id: string;
    duration_minutes: number;
    status: number;
  }[];
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
  /** The own statuses listed — `[1]` when the request sent none (P2.SVC.01 "default 1"). */
  readonly statuses: readonly number[];
  /** Archived rows are added, whatever their status (`include_archived` — a management read). */
  readonly include_archived: boolean;
  /**
   * The picker view (design D5 · Recorded reading 1): no `status`, no `include_archived`, `sold` = here —
   * it also leaves out the services of an inactive category. Any other request lists by own status.
   */
  readonly picker: boolean;
  /** `sold=all` lists services that are not sold at `branch_id` too (a management read). */
  readonly sold: 'here' | 'all';
  /** The price rows effective on this Myanmar date are read (`unpriced_branch_ids`). */
  readonly today: string;
  readonly after?: string;
  readonly take: number;
}

export interface CategoryListFilter {
  readonly statuses: readonly number[];
  readonly include_archived: boolean;
}

/** The members of one service beyond the list row (P2.SVC.03). */
export interface ServiceDetailRow extends ServiceListRow {
  readonly description_mm: string | null;
  readonly description_en: string | null;
  readonly public_description_mm: string | null;
  readonly public_description_en: string | null;
  readonly image_attachment_id: string | null;
}

const DETAIL_SELECT = {
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
  description_mm: true,
  description_en: true,
  public_description_mm: true,
  public_description_en: true,
  image_attachment_id: true,
} as const;

@Injectable()
export class ServiceListRepository {
  services(db: Tx, filter: ServiceListFilter): Promise<ServiceListRow[]> {
    const day = new Date(`${filter.today}T00:00:00Z`);
    const text = filter.q?.trim();
    const live = {
      archived_at: null,
      status: { in: [...filter.statuses] },
      ...(filter.picker
        ? { service_categories: { status: ServiceCategoryStatus.ACTIVE, archived_at: null } }
        : {}),
    };
    return db.services.findMany({
      where: {
        AND: [
          filter.include_archived ? { OR: [live, { archived_at: { not: null } }] } : live,
          ...(filter.category_id === undefined ? [] : [{ category_id: filter.category_id }]),
          ...(filter.pricing_mode === undefined ? [] : [{ pricing_mode: filter.pricing_mode }]),
          ...(filter.branch_id === undefined || filter.sold === 'all'
            ? []
            : [
                {
                  branch_services: {
                    some: { branch_id: filter.branch_id, status: ServiceStatus.ACTIVE },
                  },
                },
              ]),
          ...(text === undefined || text === ''
            ? []
            : [
                {
                  OR: [
                    { name_mm: { contains: likeText(text), mode: 'insensitive' as const } },
                    { name_en: { contains: likeText(text), mode: 'insensitive' as const } },
                  ],
                },
              ]),
        ],
      },
      // Catalogue order (owner S7 · Recorded reading 2): category, then service.
      orderBy: [
        { service_categories: { sort_order: 'asc' } },
        { sort_order: 'asc' },
        { name_mm: 'asc' },
        { id: 'asc' },
      ],
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
          select: { branch_id: true, duration_minutes: true, status: true },
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

  /** The list of P2.CAT.01 in catalogue order; archived rows only with `include_archived`. */
  async categories(db: Tx, filter: CategoryListFilter) {
    const live = { archived_at: null, status: { in: [...filter.statuses] } };
    // Not paged, and archived rows never go away: past the ceiling the read fails loudly (CG-PERF-02).
    const rows = await db.service_categories.findMany({
      where: filter.include_archived ? { OR: [live, { archived_at: { not: null } }] } : live,
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
      take: READ_ROW_CEILING + 1,
    });
    return assertWithinCeiling(rows, 'ServiceListRepository.categories');
  }

  /** `service_count` — the non-archived services of each category, whatever their status (reading 6). */
  async serviceCounts(db: Tx): Promise<ReadonlyMap<string, number>> {
    const groups = await db.services.groupBy({
      by: ['category_id'],
      where: { archived_at: null },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.category_id, group._count._all]));
  }

  /** One service by id with every `branch_services` row (sold or not) — P2.SVC.03. */
  service(db: Tx, id: string, today: string): Promise<ServiceDetailRow | null> {
    const day = new Date(`${today}T00:00:00Z`);
    return db.services.findUnique({
      where: { id },
      select: {
        ...DETAIL_SELECT,
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
        branch_services: {
          select: { branch_id: true, duration_minutes: true, status: true },
          orderBy: { branch_id: 'asc' },
        },
      },
    });
  }
}
