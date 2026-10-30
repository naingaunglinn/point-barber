import { Injectable } from '@nestjs/common';
import { LocationType, VisitStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The visits table (Part 4 — the delivery module owns it).

export interface VisitRow {
  readonly id: string;
  readonly client_request_id: string;
  readonly branch_id: string;
  readonly booking_id: string | null;
  readonly performed_by_employee_id: string;
  readonly performer_change_reason: string | null;
  readonly proxy_reason: number | null;
  readonly location_type: number;
  readonly home_address: string | null;
  readonly status: number;
  readonly started_at: Date;
  readonly started_by_user_id: string;
  readonly completed_at: Date | null;
  readonly completed_by_user_id: string | null;
  readonly finished_at: Date | null;
  readonly incomplete_reason: string | null;
  readonly incomplete_at: Date | null;
  readonly incomplete_by_user_id: string | null;
  readonly is_late_entry: boolean;
  readonly late_entry_reason: number | null;
  readonly late_entry_note: string | null;
  readonly business_date: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const VISIT = {
  id: true,
  client_request_id: true,
  branch_id: true,
  booking_id: true,
  performed_by_employee_id: true,
  performer_change_reason: true,
  proxy_reason: true,
  location_type: true,
  home_address: true,
  status: true,
  started_at: true,
  started_by_user_id: true,
  completed_at: true,
  completed_by_user_id: true,
  finished_at: true,
  incomplete_reason: true,
  incomplete_at: true,
  incomplete_by_user_id: true,
  is_late_entry: true,
  late_entry_reason: true,
  late_entry_note: true,
  business_date: true,
  created_at: true,
  updated_at: true,
} as const;

const day = (date: string): Date => new Date(`${date}T00:00:00Z`);

@Injectable()
export class VisitsRepository {
  /** A walk-in visit of the caller at the branch (status 1 STARTED, location 1 BRANCH). */
  insertWalkIn(
    tx: Tx,
    row: {
      id: string;
      client_request_id: string;
      branch_id: string;
      performed_by_employee_id: string;
      started_by_user_id: string;
      started_at: Date;
      business_date: string;
    },
  ): Promise<VisitRow> {
    return tx.visits.create({
      data: {
        id: row.id,
        client_request_id: row.client_request_id,
        branch_id: row.branch_id,
        performed_by_employee_id: row.performed_by_employee_id,
        location_type: LocationType.BRANCH,
        status: VisitStatus.STARTED,
        started_at: row.started_at,
        started_by_user_id: row.started_by_user_id,
        business_date: day(row.business_date),
        created_at: row.started_at,
        updated_at: row.started_at,
      },
      select: VISIT,
    });
  }

  find(db: Tx, id: string): Promise<VisitRow | null> {
    return db.visits.findUnique({ where: { id }, select: VISIT });
  }

  findByClientRequestId(db: Tx, key: string): Promise<VisitRow | null> {
    return db.visits.findUnique({ where: { client_request_id: key }, select: VISIT });
  }

  async lockForUpdate(tx: Tx, id: string): Promise<VisitRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM visits WHERE id = ${id}::uuid FOR UPDATE`;
    return locked.length === 0 ? null : this.find(tx, id);
  }

  /** The performer's COMPLETED visit (its sale is OPEN until FINISH or INCOMPLETE), not a late entry. */
  awaitingPayment(db: Tx, employeeId: string): Promise<{ id: string } | null> {
    return db.visits.findFirst({
      where: {
        performed_by_employee_id: employeeId,
        status: VisitStatus.COMPLETED,
        is_late_entry: false,
      },
      orderBy: { completed_at: 'asc' },
      select: { id: true },
    });
  }

  async markCompleted(tx: Tx, id: string, at: Date, byUserId: string): Promise<void> {
    await tx.visits.update({
      where: { id },
      data: {
        status: VisitStatus.COMPLETED,
        completed_at: at,
        completed_by_user_id: byUserId,
        updated_at: at,
      },
    });
  }

  async markIncomplete(
    tx: Tx,
    id: string,
    at: Date,
    byUserId: string,
    reason: string,
  ): Promise<void> {
    await tx.visits.update({
      where: { id },
      data: {
        status: VisitStatus.INCOMPLETE,
        incomplete_at: at,
        incomplete_by_user_id: byUserId,
        incomplete_reason: reason,
        updated_at: at,
      },
    });
  }

  async markFinished(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.visits.update({
      where: { id },
      data: { status: VisitStatus.FINISHED, finished_at: at, updated_at: at },
    });
  }

  /**
   * P4.VIS.02 — the visits the caller performed or recorded. Without filters: the open ones (1, 2,
   * any date) and today's FINISHED / INCOMPLETE ones; oldest first.
   */
  mine(
    db: Tx,
    who: { employee_id: string; user_id: string },
    filter: { statuses?: readonly number[]; date?: string; today: string },
  ): Promise<VisitRow[]> {
    const mineOnly = {
      OR: [{ performed_by_employee_id: who.employee_id }, { started_by_user_id: who.user_id }],
    };
    const where =
      filter.statuses === undefined && filter.date === undefined
        ? {
            AND: [
              mineOnly,
              {
                OR: [
                  { status: { in: [VisitStatus.STARTED, VisitStatus.COMPLETED] } },
                  {
                    status: { in: [VisitStatus.FINISHED, VisitStatus.INCOMPLETE] },
                    business_date: day(filter.today),
                  },
                ],
              },
            ],
          }
        : {
            AND: [
              mineOnly,
              ...(filter.statuses === undefined ? [] : [{ status: { in: [...filter.statuses] } }]),
              ...(filter.date === undefined ? [] : [{ business_date: day(filter.date) }]),
            ],
          };
    return db.visits.findMany({
      where,
      orderBy: [{ started_at: 'asc' }, { id: 'asc' }],
      select: VISIT,
    });
  }
}
