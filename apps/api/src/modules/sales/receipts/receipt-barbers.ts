import { Injectable } from '@nestjs/common';
import type { Locale } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { DisplayNames } from '../../people/index.js';
import { ReceiptListRepository } from '../repositories/receipt-list.repository.js';

// The `barbers` of the receipts list (P4.RCP.04 · add-receipts-list-lookup design D1 step 4 · owner RL2):
// the display names, in the caller's language (AD-L10N-03), of the performers of each sale's active
// SERVICE lines — each once, in line order. One grouped query for every sale of the page.

@Injectable()
export class ReceiptBarbers {
  constructor(
    private readonly repository: ReceiptListRepository,
    private readonly names: DisplayNames,
  ) {}

  /** The names of each sale's performers, keyed by sale id; a sale without a performer is absent. */
  async of(
    db: Tx,
    saleIds: readonly string[],
    locale: Locale,
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const performers = await this.repository.performersOf(db, [...new Set(saleIds)]);
    const names = await this.names.ofEmployees([...performers.values()].flat(), locale);
    return new Map(
      [...performers].map(([saleId, employeeIds]) => [
        saleId,
        [...new Set(employeeIds)].flatMap((id) => {
          const name = names.get(id);
          return name === undefined ? [] : [name];
        }),
      ]),
    );
  }
}
