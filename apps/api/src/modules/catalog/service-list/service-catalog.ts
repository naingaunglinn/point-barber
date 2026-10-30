import { Injectable } from '@nestjs/common';
import {
  type CursorPage,
  LocationType,
  type ServiceCategoryDto,
  type ServiceListItemDto,
  type ServicesQuery,
  todayMmt,
  toMmtIso,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { decodeCursor, encodeCursor } from '../../../common/http/cursor.js';
import {
  type ServiceListRow,
  ServiceListRepository,
} from '../repositories/service-list.repository.js';

// The operational reads of the POS (P2.SVC.01 · P2.CAT.01 · P2-RULE-01 · API-PERM-03 · AD-POS-05):
// any signed-in staff member, no permission code. With `branch_id`, only the ACTIVE services with an
// ACTIVE branch_services row there; a branch outside the caller's read scope is an empty list, not an
// error. Catalogue order = sort_order, then the Myanmar name — the START chips are the first six
// SIMPLE services of it (design D12).

/**
 * One service as the caller may see it (API-PERM-03): the service is company data, but where it is sold
 * and where it lacks a price is branch data, so both lists keep only the caller's read scope. With a
 * `branch_id` the duration range is that branch's — the START chips and the picker are per branch.
 */
function toItem(row: ServiceListRow, scope: ReadScope, branchId?: string): ServiceListItemDto {
  const branchIds = row.branch_services
    .map((sold) => sold.branch_id)
    .filter((id) => inReadScope(scope, id));
  const rangeOf = branchId === undefined ? branchIds : [branchId];
  // Sold there, but no branch-level BRANCH price effective today: the quote would answer
  // not_sold_here (an OPTIONS service counts as priced when any of its variants is).
  const priced = new Set(
    row.service_prices
      .filter((price) => price.location_type === LocationType.BRANCH && price.employee_id === null)
      .map((price) => price.branch_id),
  );
  const durations = [
    ...row.branch_services
      .filter((sold) => rangeOf.includes(sold.branch_id))
      .map((sold) => sold.duration_minutes),
    ...row.service_prices
      .filter((price) => rangeOf.includes(price.branch_id))
      .flatMap((price) => (price.duration_minutes === null ? [] : [price.duration_minutes])),
  ];
  return {
    id: row.id,
    category_id: row.category_id,
    name_mm: row.name_mm,
    name_en: row.name_en,
    pricing_mode: row.pricing_mode as ServiceListItemDto['pricing_mode'],
    buffer_minutes: row.buffer_minutes,
    status: row.status as ServiceListItemDto['status'],
    show_on_website: row.show_on_website,
    sort_order: row.sort_order,
    branch_ids: branchIds,
    unpriced_branch_ids: branchIds.filter((branchId) => !priced.has(branchId)),
    duration_range: {
      min: durations.length === 0 ? 0 : Math.min(...durations),
      max: durations.length === 0 ? 0 : Math.max(...durations),
    },
    archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
    updated_at: toMmtIso(row.updated_at),
  };
}

@Injectable()
export class ServiceCatalog {
  constructor(
    private readonly repository: ServiceListRepository,
    private readonly clock: Clock,
  ) {}

  async listServices(
    db: Tx,
    query: ServicesQuery,
    scope: ReadScope,
  ): Promise<CursorPage<ServiceListItemDto>> {
    if (query.branch_id !== undefined && !inReadScope(scope, query.branch_id)) {
      return { items: [], next_cursor: null, total: null };
    }
    const rows = await this.repository.services(db, {
      branch_id: query.branch_id,
      category_id: query.category_id,
      pricing_mode: query.pricing_mode,
      q: query.q,
      today: todayMmt(this.clock.now()),
      after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => toItem(row, scope, query.branch_id)),
      next_cursor: rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null,
      total: null,
    };
  }

  async listCategories(db: Tx): Promise<{ items: ServiceCategoryDto[] }> {
    const rows = await this.repository.categories(db);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name_mm: row.name_mm,
        name_en: row.name_en,
        sort_order: row.sort_order,
        status: row.status as ServiceCategoryDto['status'],
        archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
        updated_at: toMmtIso(row.updated_at),
      })),
    };
  }
}
