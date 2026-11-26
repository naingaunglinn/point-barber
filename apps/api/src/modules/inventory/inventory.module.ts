import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';

// Bounded context `inventory` (ADR-001 · docs/engineering/module-map.md): API Part 6 — the product
// catalogue (categories, products, suppliers, adjustment reasons), stock levels and movements,
// purchases, transfers and counts. add-product-catalogue creates the module (design D1) and adds the
// catalogue's controllers and services group by group; the stock parts come with #56 – #60.
@Module({
  imports: [PlatformModule, PeopleModule],
})
export class InventoryModule {}
