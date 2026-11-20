import { Injectable } from '@nestjs/common';

import type { Tx } from '../../common/database/transaction-runner.js';

// Where a new row goes (SC2 ★ · add-service-catalogue design D7): the highest `sort_order` of its non-archived
// siblings + 1, read inside the write's transaction after its locks. Two creates at the same instant can tie;
// the catalogue order then falls back to `name_mm`, `id` (Recorded reading 11) and the next reorder makes the
// positions distinct — no advisory lock is taken for a cosmetic tie.
@Injectable()
export class CatalogueOrder {
  /** The next position among the company's non-archived categories. */
  async nextCategory(tx: Tx, companyId: string): Promise<number> {
    const { _max } = await tx.service_categories.aggregate({
      where: { company_id: companyId, archived_at: null },
      _max: { sort_order: true },
    });
    return (_max.sort_order ?? 0) + 1;
  }

  /** The next position among the non-archived services of one category. */
  async nextService(tx: Tx, categoryId: string): Promise<number> {
    const { _max } = await tx.services.aggregate({
      where: { category_id: categoryId, archived_at: null },
      _max: { sort_order: true },
    });
    return (_max.sort_order ?? 0) + 1;
  }
}
