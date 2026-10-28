import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { CustomersController } from './customers/customers.controller.js';
import { Customers } from './customers/customers.js';
import { CustomersRepository } from './repositories/customers.repository.js';

// Bounded context `booking` (ADR-001 · docs/engineering/module-map.md): Part 3 customers, bookings,
// cancel reasons, public booking. add-walkin-visit-checkout adds the customer identity function and
// the phone lookup.
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [CustomersController],
  providers: [CustomersRepository, Customers],
  exports: [Customers],
})
export class BookingModule {}
