import { Module, type OnModuleInit } from '@nestjs/common';

import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { BranchUsage, PeopleModule } from '../people/index.js';
import { CodeTables, PlatformModule } from '../platform/index.js';
import { BookingsOutsideShift, SchedulingModule } from '../scheduling/index.js';
import { CancelReasonReads } from './cancel-reasons/cancel-reason-reads.js';
import { CancelReasonSeed } from './cancel-reasons/cancel-reason-seed.js';
import { CancelReasonWrites } from './cancel-reasons/cancel-reason-writes.js';
import { BookedBlocks } from './bookings/booked-blocks.js';
import { CancelReasonsController } from './cancel-reasons/cancel-reasons.controller.js';
import { CustomersController } from './customers/customers.controller.js';
import { Customers } from './customers/customers.js';
import { BookingsRepository } from './repositories/bookings.repository.js';
import { CancelReasonsRepository } from './repositories/cancel-reasons.repository.js';
import { CustomerBookingsRepository } from './repositories/customer-bookings.repository.js';
import { CustomersRepository } from './repositories/customers.repository.js';

// Bounded context `booking` (ADR-001 · docs/engineering/module-map.md): Part 3 customers, bookings,
// cancel reasons, public booking. add-walkin-visit-checkout adds the customer identity function and
// the phone lookup; add-branch-management the count of a branch's open bookings, which people asks
// for through its BranchUsage registry (P1-RULE-09 · design D1) — people never imports booking.
// add-booking-cancel-reasons adds the cancel-reason master list and its base-seed step (design D1 · D3).
// add-schedule-patterns adds `BookedBlocks`, the implementation of scheduling's `BookedBlocksPort` (design D1).
@Module({
  imports: [PlatformModule, PeopleModule, SchedulingModule],
  controllers: [CustomersController, CancelReasonsController],
  providers: [
    CustomersRepository,
    BookingsRepository,
    CustomerBookingsRepository,
    Customers,
    CancelReasonsRepository,
    CancelReasonSeed,
    CancelReasonReads,
    CancelReasonWrites,
    BookedBlocks,
  ],
  exports: [Customers],
})
export class BookingModule implements OnModuleInit {
  constructor(
    private readonly usage: BranchUsage,
    private readonly bookings: BookingsRepository,
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly cancelReasonSeed: CancelReasonSeed,
    private readonly outsideShift: BookingsOutsideShift,
    private readonly blocks: BookedBlocks,
  ) {}

  onModuleInit(): void {
    // add-schedule-patterns design D1: `scheduling` declares the port, `booking` implements it.
    this.outsideShift.use(this.blocks);
    this.usage.register('open_bookings', (tx, branchId) => this.bookings.openAt(tx, branchId));
    // add-booking-cancel-reasons design D3: after people's 'base seed' (20) and the payment methods (30).
    this.codeTables.contribute('cancel reasons', 40, () =>
      this.runner.run((tx) => this.cancelReasonSeed.ensure(tx)),
    );
  }
}
