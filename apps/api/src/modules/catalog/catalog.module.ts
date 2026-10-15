import { Module } from '@nestjs/common';

import { CashClosingModule } from '../cash-closing/index.js';
import { PlatformModule } from '../platform/index.js';
import { Eligibility } from './eligibility/eligibility.js';
import { PriceQuote } from './price-quote/price-quote.js';
import { CatalogRepository } from './repositories/catalog.repository.js';

// Bounded context `catalog` (ADR-001 · docs/engineering/module-map.md): Part 2 service categories,
// services, options, prices, eligibility. add-walkin-visit-checkout adds the price quote, the
// eligibility lookup and the operational reads of the POS.
@Module({
  imports: [PlatformModule, CashClosingModule],
  providers: [CatalogRepository, PriceQuote, Eligibility],
  exports: [PriceQuote, Eligibility],
})
export class CatalogModule {}
