import { Module, type OnModuleInit } from '@nestjs/common';

import { OrSelfResolvers, TargetResolvers } from '../../common/access/resolvers.js';
import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { BookingModule, Customers } from '../booking/index.js';
import { CashClosingModule } from '../cash-closing/index.js';
import { CatalogModule } from '../catalog/index.js';
import { PayrollModule } from '../payroll/index.js';
import { PeopleModule } from '../people/index.js';
import { CodeTables, Jobs, PlatformModule } from '../platform/index.js';
import { SaleAccess } from './access/sale-access.js';
import { SalesCustomerActivity } from './customer-activity/sales-customer-activity.js';
import { ReceiptNumbers } from './finish/receipt-numbers.js';
import { SalesFinish } from './finish/sales-finish.js';
import { SaleLines } from './lines/sale-lines.js';
import { Sales } from './lines/sales.js';
import { Payments } from './payments/payments.js';
import { ReceiptFiles } from './receipts/receipt-files.js';
import { ReceiptReads } from './receipts/receipt-reads.js';
import { ReceiptRenderHandler } from './receipts/receipt-render.handler.js';
import { RECEIPT_RENDER, type ReceiptRenderData } from './receipts/receipt-render.job.js';
import { ReceiptViews } from './receipts/receipt-views.js';
import { VisitsRegistry } from './ports/visits-registry.js';
import { PaymentMethodsRepository } from './repositories/payment-methods.repository.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { RefundsRepository } from './repositories/refunds.repository.js';
import { SaleItemsRepository } from './repositories/sale-items.repository.js';
import { SalesRepository } from './repositories/sales.repository.js';
import { SalesController } from './sales.controller.js';
import { PaymentMethodSeed } from './seed/payment-method-seed.js';
import { SaleView } from './view/sale-view.js';
import { SaleViewers } from './view/sale-viewers.js';

// Bounded context `sales` (ADR-001 · docs/engineering/module-map.md): sales, sale items, receipt
// counters, payment methods, payments, refunds. It builds on people (the company), platform and
// booking (the customer of a FINISH, and booking's port of last_visit_at); its
// part of the base seed — the system payment methods — joins sync.code_tables right after people's
// base seed, the way people registers its steps. Its entity loaders and actor sets join the access
// registries at start-up (design D2).
@Module({
  imports: [
    PlatformModule,
    PeopleModule,
    BookingModule,
    CatalogModule,
    CashClosingModule,
    PayrollModule,
  ],
  controllers: [SalesController],
  providers: [
    PaymentMethodsRepository,
    SalesRepository,
    SaleItemsRepository,
    PaymentsRepository,
    RefundsRepository,
    PaymentMethodSeed,
    SalesCustomerActivity,
    VisitsRegistry,
    Sales,
    SaleLines,
    SaleView,
    Payments,
    ReceiptNumbers,
    SalesFinish,
    ReceiptFiles,
    ReceiptViews,
    ReceiptRenderHandler,
    ReceiptReads,
    SaleViewers,
    SaleAccess,
  ],
  exports: [
    PaymentMethodSeed,
    VisitsRegistry,
    Sales,
    SaleLines,
    SaleView,
    SaleViewers,
    Payments,
    SalesFinish,
  ],
})
export class SalesModule implements OnModuleInit {
  constructor(
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly paymentMethods: PaymentMethodSeed,
    private readonly customers: Customers,
    private readonly customerActivity: SalesCustomerActivity,
    private readonly jobs: Jobs,
    private readonly receiptRender: ReceiptRenderHandler,
    private readonly access: SaleAccess,
    private readonly targets: TargetResolvers,
    private readonly orSelf: OrSelfResolvers,
  ) {}

  onModuleInit(): void {
    // booking declares the port of last_visit_at; sales owns the finished sales (design D1).
    this.customers.useActivity(this.customerActivity);
    // After people's 'base seed' (20), which creates the company row.
    this.codeTables.contribute('payment methods', 30, () =>
      this.runner.run((tx) => this.paymentMethods.ensure(tx)),
    );
    // One receipt at a time: the renderer draws one page at a time anyway (ADR-013 decision 7).
    this.jobs.register<ReceiptRenderData>(
      RECEIPT_RENDER,
      (data, attempt) => this.receiptRender.handle(data, attempt),
      { localConcurrency: 1 },
    );
    this.access.register(this.targets, this.orSelf);
  }
}
