import { Module } from '@nestjs/common';

import { CashClosingModule } from '../cash-closing/index.js';
import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { CatalogAdminController } from './catalog-admin.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogueOrder } from './catalogue-order.js';
import { CategoryWrites } from './category-writes/category-writes.js';
import { CategoryWritesRepository } from './repositories/category-writes.repository.js';
import { Eligibility } from './eligibility/eligibility.js';
import { PriceQuote } from './price-quote/price-quote.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { ServiceListRepository } from './repositories/service-list.repository.js';
import { ServiceWritesRepository } from './repositories/service-writes.repository.js';
import { ServiceWrites } from './service-writes/service-writes.js';
import { ServiceCatalog } from './service-list/service-catalog.js';
import { ServiceDetail } from './service-detail/service-detail.js';
import { PilotCatalogue } from './pilot/pilot-catalogue.js';

// Bounded context `catalog` (ADR-001 · docs/engineering/module-map.md): Part 2 service categories,
// services, options, prices, eligibility. add-walkin-visit-checkout adds the price quote, the
// eligibility lookup and the operational reads of the POS.
@Module({
  imports: [PlatformModule, PeopleModule, CashClosingModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [
    CatalogRepository,
    CatalogueOrder,
    CategoryWrites,
    CategoryWritesRepository,
    ServiceListRepository,
    ServiceWritesRepository,
    ServiceWrites,
    PriceQuote,
    Eligibility,
    ServiceCatalog,
    ServiceDetail,
    PilotCatalogue,
  ],
  exports: [PriceQuote, Eligibility, ServiceCatalog, ServiceDetail, PilotCatalogue],
})
export class CatalogModule {}
