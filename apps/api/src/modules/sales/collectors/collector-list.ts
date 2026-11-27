import { Injectable } from '@nestjs/common';
import {
  type CollectorList as CollectorListDto,
  ErrorCode,
  SaleStatus,
  businessDateOf,
  todayMmt,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Assignments, DisplayNames } from '../../people/index.js';
import { Attendance } from '../../scheduling/index.js';
import { defaultCollectorOf } from '../payments/default-collector.js';
import { Sales } from '../lines/sales.js';
import type { VisitForSale } from '../ports/visits-port.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import type { SaleRow } from '../repositories/sales.repository.js';

// P4.SAL.14 — the "Collected by" choices (D-VIS-06 · owner B3 · design D1): the ACTIVE staff assigned to
// the sale's branch on the sale date; people clocked in here now first, earliest clock-in first, then by
// name in the caller's language (code-point order — AD-L10N-03), ties by employee id. A read: no lock
// and no transaction.

/** The sale date of the list (recorded reading 1). */
function saleDate(sale: SaleRow, visit: VisitForSale | null, now: Date): string {
  if (sale.status === SaleStatus.FINISHED && sale.business_date !== null)
    return businessDateOf(sale.business_date);
  if (visit?.is_late_entry === true) return visit.business_date;
  return todayMmt(now);
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

@Injectable()
export class CollectorList {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: Sales,
    private readonly registry: VisitsRegistry,
    private readonly assignments: Assignments,
    private readonly attendance: Attendance,
    private readonly names: DisplayNames,
    private readonly clock: Clock,
  ) {}

  async of(saleId: string): Promise<CollectorListDto> {
    const db = this.prisma;
    const sale = await this.sales.find(db, saleId);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    const visit =
      sale.visit_id === null ? null : await this.registry.visits.read(db, sale.visit_id);
    const date = saleDate(sale, visit, this.clock.now());
    const [assigned, open, locale] = await Promise.all([
      this.assignments.activeAssignedAt(db, sale.branch_id, date),
      this.attendance.openRecordsAt(db, sale.branch_id),
      this.names.callerLocale(),
    ]);
    const names = await this.names.ofEmployees(assigned, locale);
    const defaultId = await defaultCollectorOf(db, { sale, visit });
    // Someone clocked in here but not assigned on the date is not offered ("and no one else").
    const clockedIn = open.filter((record) => assigned.includes(record.employee_id));
    const clockedInIds = new Set(clockedIn.map((record) => record.employee_id));
    const rest = assigned
      .filter((id) => !clockedInIds.has(id))
      .map((id) => ({ id, name: names.get(id) ?? '' }))
      .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id));
    const ordered = [
      ...clockedIn.map((record) => record.employee_id),
      ...rest.map((entry) => entry.id),
    ];
    return {
      items: ordered.map((id) => ({
        employee_id: id,
        display_name: names.get(id) ?? '',
        clocked_in: clockedInIds.has(id),
        is_default: id === defaultId,
      })),
    };
  }
}
