import { Injectable } from '@nestjs/common';

import { businessDateOf } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import {
  type AttachmentRow,
  AttachmentsRepository,
} from '../repositories/attachments.repository.js';

// Generated files (ADR-014 · P4-RULE-18 · add-walkin-visit-checkout design D10): the rows of objects
// the API rendered and stored itself — a receipt's PDF and PNG. Uploads (staging rows, policy table,
// image pipeline) come with add-attachments-upload. The caller passes the company: platform does not
// read the people tables.

export interface GeneratedFile {
  /** From newGeneratedKey — the id inside the storage key. */
  readonly id: string;
  readonly company_id: string;
  /** `sales` or `refunds` for a receipt. */
  readonly entity_type: string;
  readonly entity_id: string;
  readonly kind: number;
  readonly file_name: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  /** The key the object was stored under (StorageService.put) — from newGeneratedKey. */
  readonly storage_key: string;
  readonly uploaded_by_user_id: string;
}

export type { AttachmentRow };

@Injectable()
export class Attachments {
  constructor(
    private readonly repository: AttachmentsRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * A new attachment id and the key to store its object under before the row exists:
   * `att/<yyyy>/<mm>/<id>/original.<ext>` (ADR-014), the month in Myanmar Time.
   */
  newGeneratedKey(ext: string): { id: string; storage_key: string } {
    const now = this.clock.now();
    const id = uuidV7(now.getTime());
    const [year, month] = businessDateOf(now).split('-');
    return { id, storage_key: `att/${year ?? ''}/${month ?? ''}/${id}/original.${ext}` };
  }

  /** One row for an object already in storage, inside the caller's transaction. */
  storeGenerated(tx: Tx, file: GeneratedFile): Promise<AttachmentRow> {
    return this.repository.insert(tx, { ...file, uploaded_at: this.clock.now() });
  }

  /** The live rows of an entity (PDF before PNG); inside a transaction, through it. */
  findGenerated(entityType: string, entityId: string): Promise<AttachmentRow[]> {
    return this.repository.liveOf(entityType, entityId);
  }
}
