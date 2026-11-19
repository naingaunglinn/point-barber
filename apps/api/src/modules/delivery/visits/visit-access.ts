import { Injectable } from '@nestjs/common';

import { paramAt } from '../../../common/access/paths.js';
import {
  type Caller,
  type LoadedTarget,
  OrSelfResolvers,
  TargetResolvers,
  routeKey,
} from '../../../common/access/resolvers.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { Sales } from '../../sales/index.js';
import { type VisitRow, VisitsRepository } from '../repositories/visits.repository.js';

// The access of the visit routes (add-walkin-visit-checkout design D2 · P4-RULE-03 · API-PERM-02):
// the loader the access guard calls for `params.id→entity.branch_id` on a visit route, and delivery's
// two actor sets. In this change the sets reduce to the performer, and for lines to the recorder too
// (proxy recording is out). The guard runs before the pipes, so an id that is not a UUID is a missing
// row — 404 — never a query error.

export const VISIT_ROUTES = [
  routeKey('GET', '/v1/visits/:id'),
  routeKey('POST', '/v1/visits/:id/complete'),
  routeKey('POST', '/v1/visits/:id/incomplete'),
];

@Injectable()
export class VisitAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsRepository,
    private readonly sales: Sales,
  ) {}

  register(targets: TargetResolvers, orSelf: OrSelfResolvers): void {
    targets.register(VISIT_ROUTES, (id) => this.target(id));
    // COMPLETE (a visit id) and the line routes (a sale id).
    orSelf.register('visit.lineActors', async (parts, caller) => {
      const visit = await this.visitOrSaleVisit(paramAt(parts, 'id'));
      return visit !== null && (isPerformer(visit, caller) || isRecorder(visit, caller));
    });
    // INCOMPLETE (a visit id).
    orSelf.register('visit.incompleteActors', async (parts, caller) => {
      const visit = await this.visit(paramAt(parts, 'id'));
      return visit !== null && isPerformer(visit, caller);
    });
  }

  private async target(id: string): Promise<LoadedTarget | null> {
    const visit = await this.visit(id);
    return visit === null ? null : { branch_ids: [visit.branch_id] };
  }

  private visit(id: string | undefined): Promise<VisitRow | null> {
    if (id === undefined || !isUuid(id)) return Promise.resolve(null);
    return this.visits.find(this.prisma, id);
  }

  /** The visit by its id, else the visit of the sale with that id. */
  private async visitOrSaleVisit(id: string | undefined): Promise<VisitRow | null> {
    const visit = await this.visit(id);
    if (visit !== null || id === undefined || !isUuid(id)) return visit;
    const sale = await this.sales.find(this.prisma, id);
    if (sale === null || sale.visit_id === null) return null;
    return this.visits.find(this.prisma, sale.visit_id);
  }
}

const isPerformer = (visit: VisitRow, caller: Caller): boolean =>
  visit.performed_by_employee_id === caller.employeeId;

const isRecorder = (visit: VisitRow, caller: Caller): boolean =>
  visit.started_by_user_id === caller.userId;
