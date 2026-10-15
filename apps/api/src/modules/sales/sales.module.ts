import { Module, type OnModuleInit } from '@nestjs/common';

import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { PeopleModule } from '../people/index.js';
import { CodeTables, PlatformModule } from '../platform/index.js';
import { PaymentMethodsRepository } from './repositories/payment-methods.repository.js';
import { PaymentMethodSeed } from './seed/payment-method-seed.js';

// Bounded context `sales` (ADR-001 · docs/engineering/module-map.md): sales, sale items, receipt
// counters, payment methods, payments, refunds. It builds on people (the company) and platform; its
// part of the base seed — the system payment methods — joins sync.code_tables right after people's
// base seed, the way people registers its steps.
@Module({
  imports: [PlatformModule, PeopleModule],
  providers: [PaymentMethodsRepository, PaymentMethodSeed],
  exports: [PaymentMethodSeed],
})
export class SalesModule implements OnModuleInit {
  constructor(
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly paymentMethods: PaymentMethodSeed,
  ) {}

  onModuleInit(): void {
    // After people's 'base seed' (20), which creates the company row.
    this.codeTables.contribute('payment methods', 30, () =>
      this.runner.run((tx) => this.paymentMethods.ensure(tx)),
    );
  }
}
