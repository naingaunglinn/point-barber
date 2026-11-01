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
import type { VisitForSale } from '../ports/visits-port.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { SaleItemsRepository } from '../repositories/sale-items.repository.js';
import { type SaleRow, SalesRepository } from '../repositories/sales.repository.js';

// The access of the sale and payment routes (add-walkin-visit-checkout design D2 · P4-RULE-03 ·
// API-PERM-02): the loaders the access guard calls for `params.id→entity.branch_id`, and sales' two
// actor sets. Checkout actors reduce to the visit's performer in this change; readers are the performer
// of the visit or of a line, the recorder and the finisher. The guard runs before the pipes, so an id
// that is not a UUID is a missing row — 404 — never a query error.

export const SALE_ROUTES = [
  routeKey('GET', '/v1/sales/:id'),
  routeKey('POST', '/v1/sales/:id/items'),
  routeKey('POST', '/v1/sales/:id/items/:item_id/remove'),
  routeKey('POST', '/v1/sales/:id/finish'),
  routeKey('POST', '/v1/sales/:id/payments'),
];

export const PAYMENT_ROUTES = [routeKey('POST', '/v1/payments/:id/void')];

@Injectable()
export class SaleAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesRepository,
    private readonly items: SaleItemsRepository,
    private readonly payments: PaymentsRepository,
    private readonly registry: VisitsRegistry,
  ) {}

  register(targets: TargetResolvers, orSelf: OrSelfResolvers): void {
    targets.register(SALE_ROUTES, async (id) => branchOf(await this.sale(id)));
    targets.register(PAYMENT_ROUTES, async (id) => branchOf(await this.saleOfPayment(id)));
    // FINISH and payment add (a sale id), payment void (a payment id).
    orSelf.register('sale.checkoutActors', async (parts, caller) => {
      const id = paramAt(parts, 'id');
      const sale = (await this.sale(id)) ?? (await this.saleOfPayment(id));
      const visit = await this.visitOf(sale);
      return visit !== null && visit.performed_by_employee_id === caller.employeeId;
    });
    // The read of a sale (a sale id) and of a visit (a visit id).
    orSelf.register('sale.readers', async (parts, caller) => {
      const id = paramAt(parts, 'id');
      let sale = await this.sale(id);
      let visit = await this.visitOf(sale);
      if (sale === null && id !== undefined && isUuid(id)) {
        visit = await this.registry.visits.read(this.prisma, id);
        sale = visit === null ? null : await this.sales.findByVisit(this.prisma, visit.id);
      }
      return this.isReader(sale, visit, caller);
    });
  }

  private sale(id: string | undefined): Promise<SaleRow | null> {
    if (id === undefined || !isUuid(id)) return Promise.resolve(null);
    return this.sales.find(this.prisma, id);
  }

  private async saleOfPayment(id: string | undefined): Promise<SaleRow | null> {
    if (id === undefined || !isUuid(id)) return null;
    const payment = await this.payments.find(this.prisma, id);
    return payment === null ? null : this.sales.find(this.prisma, payment.sale_id);
  }

  private async visitOf(sale: SaleRow | null): Promise<VisitForSale | null> {
    if (sale === null || sale.visit_id === null) return null;
    return this.registry.visits.read(this.prisma, sale.visit_id);
  }

  private async isReader(
    sale: SaleRow | null,
    visit: VisitForSale | null,
    caller: Caller,
  ): Promise<boolean> {
    if (visit !== null) {
      if (visit.performed_by_employee_id === caller.employeeId) return true;
      if (visit.started_by_user_id === caller.userId) return true;
    }
    if (sale === null) return false;
    if (sale.finished_by_user_id === caller.userId) return true;
    const lines = await this.items.ofSale(this.prisma, sale.id);
    return lines.some((line) => line.performed_by_employee_id === caller.employeeId);
  }
}

const branchOf = (sale: SaleRow | null): LoadedTarget | null =>
  sale === null ? null : { branch_ids: [sale.branch_id] };
