import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { AttachmentsRepository } from '../repositories/attachments.repository.js';

// The lock of a receipt's files (CG-DB-08 · add-walkin-visit-checkout design D10): the job and a GET
// that both rendered a receipt take it before they look again and store, so exactly one set of rows
// is kept and the loser deletes its objects after the transaction.
@Injectable()
export class ReceiptFilesLock {
  constructor(private readonly repository: AttachmentsRepository) {}

  /** `pg_advisory_xact_lock(hashtextextended('receipt:' || entity_id, 0))`, held to commit. */
  acquire(tx: Tx, entityId: string): Promise<void> {
    return this.repository.lockReceiptFiles(tx, entityId);
  }
}
