import { Module, type OnModuleInit } from '@nestjs/common';

import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { BookingModule, Customers } from '../booking/index.js';
import { CashClosingModule } from '../cash-closing/index.js';
import { CatalogModule } from '../catalog/index.js';
import { PeopleModule } from '../people/index.js';
import { CodeTables, PlatformModule } from '../platform/index.js';
import { SalesCustomerActivity } from './customer-activity/sales-customer-activity.js';
import { SaleLines } from './lines/sale-lines.js';
import { Sales } from './lines/sales.js';
import { Payments } from './payments/payments.js';
import { VisitsRegistry } from './ports/visits-registry.js';
import { PaymentMethodsRepository } from './repositories/payment-methods.repository.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { RefundsRepository } from './repositories/refunds.repository.js';
import { SaleItemsRepository } from './repositories/sale-items.repository.js';
import { SalesRepository } from './repositories/sales.repository.js';
import { PaymentMethodSeed } from './seed/payment-method-seed.js';
import { SaleView } from './view/sale-view.js';

// Bounded context `sales` (ADR-001 · docs/engineering/module-map.md): sales, sale items, receipt
// counters, payment methods, payments, refunds. It builds on people (the company), platform and
// booking (the customer of a FINISH, and booking's port of last_visit_at); its
// part of the base seed — the system payment methods — joins sync.code_tables right after people's
// base seed, the way people registers its steps.
@Module({
  imports: [PlatformModule, PeopleModule, BookingModule, CatalogModule, CashClosingModule],
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
  ],
  exports: [PaymentMethodSeed, VisitsRegistry, Sales, SaleLines, SaleView, Payments],
})
export class SalesModule implements OnModuleInit {
  constructor(
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly paymentMethods: PaymentMethodSeed,
    private readonly customers: Customers,
    private readonly customerActivity: SalesCustomerActivity,
  ) {}

  onModuleInit(): void {
    // booking declares the port of last_visit_at; sales owns the finished sales (design D1).
    this.customers.useActivity(this.customerActivity);
    // After people's 'base seed' (20), which creates the company row.
    this.codeTables.contribute('payment methods', 30, () =>
      this.runner.run((tx) => this.paymentMethods.ensure(tx)),
    );
  }
}
