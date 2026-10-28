import { Module, type OnModuleInit } from '@nestjs/common';

import { OrSelfResolvers, TargetResolvers } from '../../common/access/resolvers.js';

import { CashClosingModule } from '../cash-closing/index.js';
import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { SalesModule, VisitsRegistry } from '../sales/index.js';
import { VisitsRepository } from './repositories/visits.repository.js';
import { DeliveryVisitsPort } from './visits/delivery-visits-port.js';
import { VisitAccess } from './visits/visit-access.js';
import { VisitView } from './visits/visit-view.js';
import { VisitsController } from './visits/visits.controller.js';
import { Visits } from './visits/visits.js';

// Bounded context `delivery` (ADR-001 · docs/engineering/module-map.md): Part 4 visits. It imports
// sales (START creates the sale; COMPLETE and INCOMPLETE lock and change it) and implements sales'
// VisitsPort, registered at start-up, so there is no import cycle (design D1). Its entity loaders and
// actor sets join the access registries the same way (design D2).
@Module({
  imports: [PlatformModule, PeopleModule, CashClosingModule, SalesModule],
  controllers: [VisitsController],
  providers: [VisitsRepository, VisitView, Visits, DeliveryVisitsPort, VisitAccess],
  exports: [Visits],
})
export class DeliveryModule implements OnModuleInit {
  constructor(
    private readonly registry: VisitsRegistry,
    private readonly port: DeliveryVisitsPort,
    private readonly access: VisitAccess,
    private readonly targets: TargetResolvers,
    private readonly orSelf: OrSelfResolvers,
  ) {}

  onModuleInit(): void {
    this.registry.use(this.port);
    this.access.register(this.targets, this.orSelf);
  }
}
