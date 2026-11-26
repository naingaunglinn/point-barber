import { Module, type OnModuleInit } from '@nestjs/common';

import { CashClosingModule } from '../cash-closing/index.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { PlatformModule, WebsiteCatalog } from '../platform/index.js';
import { CatalogController } from './catalog.controller.js';
import { Eligibility } from './eligibility/eligibility.js';
import { PriceQuote } from './price-quote/price-quote.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { ServiceListRepository } from './repositories/service-list.repository.js';
import { ServiceCatalog } from './service-list/service-catalog.js';
import { ServiceDetail } from './service-detail/service-detail.js';
import { PilotCatalogue } from './pilot/pilot-catalogue.js';

// Bounded context `catalog` (ADR-001 · docs/engineering/module-map.md): Part 2 service categories,
// services, options, prices, eligibility. add-walkin-visit-checkout adds the price quote, the
// eligibility lookup and the operational reads of the POS.
@Module({
  imports: [PlatformModule, CashClosingModule],
  controllers: [CatalogController],
  providers: [
    CatalogRepository,
    ServiceListRepository,
    PriceQuote,
    Eligibility,
    ServiceCatalog,
    ServiceDetail,
    PilotCatalogue,
  ],
  exports: [PriceQuote, Eligibility, ServiceCatalog, ServiceDetail, PilotCatalogue],
})
export class CatalogModule implements OnModuleInit {
  constructor(
    private readonly websiteCatalog: WebsiteCatalog,
    private readonly serviceCatalog: ServiceCatalog,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    // The website management counts the services shown on the site (add-website-management design D1).
    this.websiteCatalog.use({ countOnWebsite: () => this.serviceCatalog.countOnWebsite(this.prisma) });
  }
}
