import { Module, type OnModuleInit } from '@nestjs/common';

import { CashClosingModule } from '../cash-closing/index.js';
import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { SalesModule, VisitsRegistry } from '../sales/index.js';
import { VisitsRepository } from './repositories/visits.repository.js';
import { DeliveryVisitsPort } from './visits/delivery-visits-port.js';
import { VisitView } from './visits/visit-view.js';
import { Visits } from './visits/visits.js';

// Bounded context `delivery` (ADR-001 · docs/engineering/module-map.md): Part 4 visits. It imports
// sales (START creates the sale; COMPLETE and INCOMPLETE lock and change it) and implements sales'
// VisitsPort, registered at start-up, so there is no import cycle (design D1).
@Module({
  imports: [PlatformModule, PeopleModule, CashClosingModule, SalesModule],
  providers: [VisitsRepository, VisitView, Visits, DeliveryVisitsPort],
  exports: [Visits],
})
export class DeliveryModule implements OnModuleInit {
  constructor(
    private readonly registry: VisitsRegistry,
    private readonly port: DeliveryVisitsPort,
  ) {}

  onModuleInit(): void {
    this.registry.use(this.port);
  }
}
