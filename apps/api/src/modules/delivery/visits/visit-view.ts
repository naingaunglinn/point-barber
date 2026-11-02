import { Injectable } from '@nestjs/common';
import { type VisitDto, type WarningDto, toMmtIso } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { DisplayNames } from '../../people/index.js';
import { Sales, type SaleViewer, SaleView, type VisitForSale } from '../../sales/index.js';
import type { VisitRow } from '../repositories/visits.repository.js';

// The one Visit mapper (P4.VIS.02 – .06 `Visit` · API-ERR-03): the visit with its sale, people by
// display name in the caller's language. A walk-in has no booking, no booked barber and no proxy.

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const instant = (date: Date | null): string | null => (date === null ? null : toMmtIso(date));

export function visitForSale(visit: VisitRow): VisitForSale {
  return {
    id: visit.id,
    branch_id: visit.branch_id,
    status: visit.status,
    performed_by_employee_id: visit.performed_by_employee_id,
    started_by_user_id: visit.started_by_user_id,
    business_date: isoDate(visit.business_date),
    location_type: visit.location_type,
    is_late_entry: visit.is_late_entry,
    started_at: visit.started_at,
    completed_at: visit.completed_at,
  };
}

@Injectable()
export class VisitView {
  constructor(
    private readonly sales: Sales,
    private readonly saleView: SaleView,
    private readonly names: DisplayNames,
  ) {}

  async of(
    db: Tx,
    visit: VisitRow,
    viewer: SaleViewer,
    warnings: readonly WarningDto[] = [],
  ): Promise<VisitDto> {
    const sale = await this.sales.findByVisit(db, visit.id);
    if (sale === null) throw new Error(`visit ${visit.id} has no sale`);
    const locale = await this.names.callerLocale();
    const userIds = [
      visit.started_by_user_id,
      visit.completed_by_user_id,
      visit.incomplete_by_user_id,
    ].filter((id): id is string => id !== null);
    const [users, employees, saleDto] = await Promise.all([
      this.names.ofUsers(userIds, locale),
      this.names.ofEmployees([visit.performed_by_employee_id], locale),
      this.saleView.of(db, sale, visitForSale(visit), viewer),
    ]);
    const user = (id: string | null) =>
      id === null ? null : { user_id: id, display_name: users.get(id) ?? '' };
    return {
      id: visit.id,
      branch_id: visit.branch_id,
      booking_id: visit.booking_id,
      status: visit.status as VisitDto['status'],
      performed_by: {
        id: visit.performed_by_employee_id,
        display_name: employees.get(visit.performed_by_employee_id) ?? '',
      },
      booked_employee: null,
      performer_change_reason: visit.performer_change_reason,
      proxy_reason: visit.proxy_reason as VisitDto['proxy_reason'],
      started_by: {
        user_id: visit.started_by_user_id,
        display_name: users.get(visit.started_by_user_id) ?? '',
      },
      location_type: visit.location_type as VisitDto['location_type'],
      home_address: visit.home_address,
      started_at: toMmtIso(visit.started_at),
      completed_at: instant(visit.completed_at),
      completed_by: user(visit.completed_by_user_id),
      finished_at: instant(visit.finished_at),
      incomplete_at: instant(visit.incomplete_at),
      incomplete_by: user(visit.incomplete_by_user_id),
      incomplete_reason: visit.incomplete_reason,
      is_late_entry: visit.is_late_entry,
      late_entry_reason: visit.late_entry_reason as VisitDto['late_entry_reason'],
      late_entry_note: visit.late_entry_note,
      business_date: isoDate(visit.business_date),
      recorded_at: toMmtIso(visit.created_at),
      updated_at: toMmtIso(visit.updated_at),
      sale: saleDto,
      warnings: [...warnings],
    };
  }
}
