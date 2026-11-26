import { Injectable } from '@nestjs/common';
import { ErrorCode, type ReceiptLookupDto } from '@point/shared';

import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { ReceiptListRepository } from '../repositories/receipt-list.repository.js';

// P4.RCP.03 — a receipt by its exact number (add-receipts-list-lookup design D2): the number is already
// normalised (trim, Myanmar digits, upper case — `normalizeReceiptNumber`), so the match is an equality on
// the two unique number columns. No match and a match outside the read scope are the same 404.

@Injectable()
export class ReceiptLookup {
  constructor(private readonly repository: ReceiptListRepository) {}

  async find(db: Tx, scope: ReadScope, number: string): Promise<ReceiptLookupDto> {
    const found =
      (await this.repository.saleByNumber(db, number)) ??
      (await this.repository.refundByNumber(db, number));
    if (found === null || !inReadScope(scope, found.branch_id)) {
      throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    }
    return {
      kind: found.kind,
      sale_id: found.sale_id,
      refund_id: found.refund_id,
      number: found.number,
      branch_id: found.branch_id,
    };
  }
}
