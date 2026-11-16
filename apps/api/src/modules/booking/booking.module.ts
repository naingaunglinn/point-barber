import { Module, type OnModuleInit } from '@nestjs/common';

import { BranchUsage, PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { CustomersController } from './customers/customers.controller.js';
import { Customers } from './customers/customers.js';
import { BookingsRepository } from './repositories/bookings.repository.js';
import { CustomersRepository } from './repositories/customers.repository.js';

// Bounded context `booking` (ADR-001 · docs/engineering/module-map.md): Part 3 customers, bookings,
// cancel reasons, public booking. add-walkin-visit-checkout adds the customer identity function and
// the phone lookup; add-branch-management the count of a branch's open bookings, which people asks
// for through its BranchUsage registry (P1-RULE-09 · design D1) — people never imports booking.
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [CustomersController],
  providers: [CustomersRepository, BookingsRepository, Customers],
  exports: [Customers],
})
export class BookingModule implements OnModuleInit {
  constructor(
    private readonly usage: BranchUsage,
    private readonly bookings: BookingsRepository,
  ) {}

  onModuleInit(): void {
    this.usage.register('open_bookings', (tx, branchId) => this.bookings.openAt(tx, branchId));
  }
}
