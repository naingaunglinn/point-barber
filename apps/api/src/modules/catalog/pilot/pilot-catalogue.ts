import { Injectable } from '@nestjs/common';
import type { PilotData } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import {
  PilotRefused,
  type PilotRunContext,
  changedValue,
  dbDate,
} from '../../../common/pilot/pilot-run.js';
import { Audit } from '../../platform/index.js';

// The `catalog` surface of the pilot data seed — the module's first write surface (add-pilot-data-seed
// design D3 / D5 · P2-RULE-01 / 03 / 04 / 06 · PD1 / PD3 ★): SIMPLE company services in the file's
// order, sold at the pilot branch with their durations, branch and barber prices and eligibility from
// the run's business date. Found by natural key; a missing row is written, an equal one left alone, a
// different stored value refused. Nothing is ended or archived. add-service-catalogue,
// add-service-prices and add-service-eligibility build the real write services (design D10).

const LOCATION_BRANCH = 1;
const PRICING_SIMPLE = 1;

export interface PilotCatalogueKeys {
  readonly companyId: string;
  readonly branchId: string;
  readonly branchCode: string;
  /** Employee id by employee code, for every person of the file. */
  readonly employeeIds: ReadonlyMap<string, string>;
}

type Service = PilotData['categories'][number]['services'][number];

/** `"<name_mm>" (<name_en>)` — how a refusal names a category or service. */
const named = (row: { name_mm: string; name_en?: string | undefined }) =>
  row.name_en === undefined ? `"${row.name_mm}"` : `"${row.name_mm}" (${row.name_en})`;

@Injectable()
export class PilotCatalogue {
  constructor(private readonly audit: Audit) {}

  async apply(
    tx: Tx,
    data: PilotData,
    keys: PilotCatalogueKeys,
    ctx: PilotRunContext,
  ): Promise<void> {
    const day = dbDate(ctx.businessDate);
    await this.refuseChanged(tx, data, keys, day);

    const serviceIds = new Map<string, string>();
    for (const [c, category] of data.categories.entries()) {
      const categoryId = await this.category(tx, keys.companyId, category, c + 1, ctx);
      for (const [s, service] of category.services.entries()) {
        serviceIds.set(
          service.name_mm,
          await this.service(tx, keys.companyId, categoryId, service, s + 1, ctx),
        );
      }
    }
    for (const service of data.categories.flatMap((category) => category.services)) {
      const serviceId = serviceIds.get(service.name_mm) ?? '';
      await this.branchSale(tx, keys, serviceId, service, ctx);
      await this.prices(tx, keys, serviceId, service, day, ctx);
    }
    await this.eligibility(tx, data, keys, serviceIds, day, ctx);
  }

  /** Every stored value that differs from the file, before anything is written (D4.6 · PD3 ★). */
  private async refuseChanged(
    tx: Tx,
    data: PilotData,
    keys: PilotCatalogueKeys,
    day: Date,
  ): Promise<void> {
    const problems: string[] = [];
    for (const category of data.categories) {
      const row = await this.findCategory(tx, keys.companyId, category.name_mm);
      if (row !== null && row.name_en !== (category.name_en ?? null)) {
        problems.push(
          changedValue(
            'service_categories',
            named(category),
            'name_en',
            row.name_en,
            category.name_en,
          ),
        );
      }
      for (const service of category.services) {
        const stored = await this.findService(tx, keys.companyId, service.name_mm);
        if (stored === null) continue;
        if (stored.name_en !== (service.name_en ?? null)) {
          problems.push(
            changedValue('services', named(service), 'name_en', stored.name_en, service.name_en),
          );
        }
        const sale = await tx.branch_services.findFirst({
          where: { branch_id: keys.branchId, service_id: stored.id },
          select: { duration_minutes: true },
        });
        if (sale !== null && sale.duration_minutes !== service.duration_minutes) {
          problems.push(
            changedValue(
              'branch_services',
              `${named(service)} at ${keys.branchCode}`,
              'duration_minutes',
              sale.duration_minutes,
              service.duration_minutes,
            ),
          );
        }
        for (const cell of this.cells(service, keys)) {
          const price = await this.findPrice(tx, keys.branchId, stored.id, cell.employeeId, day);
          if (price !== null && price.price_amount !== BigInt(cell.price)) {
            problems.push(
              changedValue(
                'service_prices',
                `${named(service)} at ${keys.branchCode}, ${cell.label}`,
                'price_amount',
                price.price_amount,
                cell.price,
              ),
            );
          }
        }
      }
    }
    if (problems.length > 0) throw new PilotRefused(problems);
  }

  private findCategory(tx: Tx, companyId: string, nameMm: string) {
    return tx.service_categories.findFirst({
      where: { company_id: companyId, name_mm: nameMm, archived_at: null },
      select: { id: true, name_en: true },
    });
  }

  private findService(tx: Tx, companyId: string, nameMm: string) {
    return tx.services.findFirst({
      where: { company_id: companyId, name_mm: nameMm, archived_at: null },
      select: { id: true, name_en: true },
    });
  }

  /** The price row of the cell effective on the run's date (P2-RULE-04). */
  private findPrice(
    tx: Tx,
    branchId: string,
    serviceId: string,
    employeeId: string | null,
    day: Date,
  ) {
    return tx.service_prices.findFirst({
      where: {
        branch_id: branchId,
        service_id: serviceId,
        service_variant_id: null,
        location_type: LOCATION_BRANCH,
        employee_id: employeeId,
        archived_at: null,
        effective_from: { lte: day },
        OR: [{ effective_to: null }, { effective_to: { gte: day } }],
      },
      select: { id: true, price_amount: true },
    });
  }

  /** The branch price and the barber prices of a service. */
  private cells(service: Service, keys: PilotCatalogueKeys) {
    return [
      { employeeId: null, price: service.price, label: 'branch price' },
      ...(service.barber_prices ?? []).map((cell) => ({
        employeeId: keys.employeeIds.get(cell.employee_code) ?? null,
        price: cell.price,
        label: `barber price ${cell.employee_code}`,
      })),
    ];
  }

  private async category(
    tx: Tx,
    companyId: string,
    category: PilotData['categories'][number],
    sortOrder: number,
    ctx: PilotRunContext,
  ): Promise<string> {
    const row = await this.findCategory(tx, companyId, category.name_mm);
    if (row !== null) {
      ctx.plan.unchanged('service_categories');
      return row.id;
    }
    const id = uuidV7(ctx.now.getTime());
    const values = {
      name_mm: category.name_mm,
      name_en: category.name_en ?? null,
      sort_order: sortOrder,
      status: 1,
    };
    await tx.service_categories.create({
      data: { id, company_id: companyId, ...values, created_at: ctx.now, updated_at: ctx.now },
    });
    ctx.plan.created('service_categories');
    // Company master: no branch (P2-RULE-12).
    this.audit.emitSystem({
      action: 'category.create',
      entity_type: 'service_categories',
      entity_id: id,
      branch_id: null,
      after: { ...values, operator: ctx.operator },
    });
    return id;
  }

  private async service(
    tx: Tx,
    companyId: string,
    categoryId: string,
    service: Service,
    sortOrder: number,
    ctx: PilotRunContext,
  ): Promise<string> {
    const row = await this.findService(tx, companyId, service.name_mm);
    if (row !== null) {
      ctx.plan.unchanged('services');
      return row.id;
    }
    const id = uuidV7(ctx.now.getTime());
    const values = {
      category_id: categoryId,
      name_mm: service.name_mm,
      name_en: service.name_en ?? null,
      pricing_mode: PRICING_SIMPLE,
      sort_order: sortOrder,
      status: 1,
    };
    await tx.services.create({
      data: { id, company_id: companyId, ...values, created_at: ctx.now, updated_at: ctx.now },
    });
    ctx.plan.created('services');
    this.audit.emitSystem({
      action: 'service.create',
      entity_type: 'services',
      entity_id: id,
      branch_id: null,
      after: { ...values, operator: ctx.operator },
    });
    return id;
  }

  private async branchSale(
    tx: Tx,
    keys: PilotCatalogueKeys,
    serviceId: string,
    service: Service,
    ctx: PilotRunContext,
  ): Promise<void> {
    const sale = await tx.branch_services.findFirst({
      where: { branch_id: keys.branchId, service_id: serviceId },
      select: { id: true },
    });
    if (sale !== null) {
      ctx.plan.unchanged('branch_services');
      return;
    }
    const id = uuidV7(ctx.now.getTime());
    await tx.branch_services.create({
      data: {
        id,
        branch_id: keys.branchId,
        service_id: serviceId,
        duration_minutes: service.duration_minutes,
        status: 1,
        created_at: ctx.now,
        updated_at: ctx.now,
      },
    });
    ctx.plan.created('branch_services');
    this.audit.emitSystem({
      action: 'service.branches_set',
      entity_type: 'services',
      entity_id: serviceId,
      branch_id: keys.branchId,
      after: {
        branches: [{ branch_id: keys.branchId, duration_minutes: service.duration_minutes }],
        operator: ctx.operator,
      },
    });
  }

  /** One `price.set` per service, holding the cells it wrote (P2.PRC.02 writes one service). */
  private async prices(
    tx: Tx,
    keys: PilotCatalogueKeys,
    serviceId: string,
    service: Service,
    day: Date,
    ctx: PilotRunContext,
  ): Promise<void> {
    const written: { employee_id: string | null; price_amount: number }[] = [];
    for (const cell of this.cells(service, keys)) {
      if ((await this.findPrice(tx, keys.branchId, serviceId, cell.employeeId, day)) !== null) {
        ctx.plan.unchanged('service_prices');
        continue;
      }
      await tx.service_prices.create({
        data: {
          id: uuidV7(ctx.now.getTime()),
          branch_id: keys.branchId,
          service_id: serviceId,
          location_type: LOCATION_BRANCH,
          employee_id: cell.employeeId,
          price_amount: BigInt(cell.price),
          effective_from: day,
          created_at: ctx.now,
          updated_at: ctx.now,
        },
      });
      ctx.plan.created('service_prices');
      written.push({ employee_id: cell.employeeId, price_amount: cell.price });
    }
    if (written.length === 0) return;
    this.audit.emitSystem({
      action: 'price.set',
      entity_type: 'services',
      entity_id: serviceId,
      branch_id: keys.branchId,
      after: {
        location_type: LOCATION_BRANCH,
        effective_from: ctx.businessDate,
        cells: written,
        operator: ctx.operator,
      },
    });
  }

  /** Every person may perform every service of the file unless the file narrows it (PD1 ★). */
  private async eligibility(
    tx: Tx,
    data: PilotData,
    keys: PilotCatalogueKeys,
    serviceIds: ReadonlyMap<string, string>,
    day: Date,
    ctx: PilotRunContext,
  ): Promise<void> {
    const all = data.categories.flatMap((category) => category.services.map((s) => s.name_mm));
    const written: { employee_id: string; service_id: string }[] = [];
    for (const person of data.people) {
      const employeeId = keys.employeeIds.get(person.employee_code) ?? '';
      for (const name of person.services ?? all) {
        const serviceId = serviceIds.get(name) ?? '';
        const open = await tx.employee_service_eligibilities.findFirst({
          where: {
            employee_id: employeeId,
            branch_id: keys.branchId,
            service_id: serviceId,
            effective_to: null,
            archived_at: null,
          },
          select: { id: true },
        });
        if (open !== null) {
          ctx.plan.unchanged('employee_service_eligibilities');
          continue;
        }
        await tx.employee_service_eligibilities.create({
          data: {
            id: uuidV7(ctx.now.getTime()),
            employee_id: employeeId,
            branch_id: keys.branchId,
            service_id: serviceId,
            effective_from: day,
            created_at: ctx.now,
            updated_at: ctx.now,
          },
        });
        ctx.plan.created('employee_service_eligibilities');
        written.push({ employee_id: employeeId, service_id: serviceId });
      }
    }
    if (written.length === 0) return;
    // One action per branch, as P2.ELG.02 (design D8).
    this.audit.emitSystem({
      action: 'eligibility.set',
      entity_type: 'employee_service_eligibilities',
      entity_id: null,
      branch_id: keys.branchId,
      after: { effective_from: ctx.businessDate, added: written, operator: ctx.operator },
    });
  }
}
