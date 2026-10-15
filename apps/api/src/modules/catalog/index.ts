// Public surface of the `catalog` module (CG-ARCH-01 · ADR-001 rule 1).
export { CatalogModule } from './catalog.module.js';
export { Eligibility } from './eligibility/eligibility.js';
export {
  PriceQuote,
  type Quote,
  type QuoteInput,
  type QuoteRefusal,
  type QuotedItem,
  toQuoteDto,
} from './price-quote/price-quote.js';
export { ServiceCatalog } from './service-list/service-catalog.js';
