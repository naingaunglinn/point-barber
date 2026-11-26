import { Injectable } from '@nestjs/common';

import { businessDateOf } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import {
  type AttachmentRow,
  AttachmentsRepository,
} from '../repositories/attachments.repository.js';
import { publicMediaPath, publicMediaUrl } from './public-media-path.js';
import {
  type AttachmentVariant,
  objectKey,
  variantObject,
  type VariantSource,
} from './variant-object.js';

// Generated files (ADR-014 · P4-RULE-18 · add-walkin-visit-checkout design D10): the rows of objects
// the API rendered and stored itself — a receipt's PDF and PNG. Uploads (staging rows, policy table,
// image pipeline) are in attachment-uploads.ts and attachment-reads.ts. The caller passes the company:
// platform does not read the people tables.

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
    private readonly config: AppConfig,
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

  /**
   * The non-deleted row with that id, or null when there is none or it is soft-deleted (add-company-profile
   * design D7 · add-attachments-upload design D1). It checks no read right: it is for server code that
   * asks for a row it already knows, such as the receipt's logo.
   */
  findLive(id: string): Promise<AttachmentRow | null> {
    return this.repository.findLive(id);
  }

  /** `/api/v1/public/media/<id>/<variant>` — what `logo_url`, `photo_url` and `image_url` hold (P8-RULE-04). */
  publicMediaPath(attachmentId: string, variant: AttachmentVariant = 'original'): string {
    return publicMediaPath(attachmentId, variant);
  }

  /** The same path under `SITE_ORIGIN`, for an Open Graph image. */
  publicMediaUrl(attachmentId: string, variant: AttachmentVariant = 'original'): string {
    return publicMediaUrl(this.config.env.SITE_ORIGIN, attachmentId, variant);
  }

  /** The key of a variant object of a row (`original` is the row's own key). */
  objectKey(row: VariantSource, variant: AttachmentVariant): string {
    return objectKey(row, variant);
  }

  /**
   * The object and content type that answer a variant of a row held by server code — the same rule
   * as the signed link and the public path (AT3). Checks no read right; use the returned `mime`.
   */
  variantObject(row: VariantSource, variant: AttachmentVariant): { key: string; mime: string } {
    return variantObject(row, variant);
  }

  /** The live rows of an entity (PDF before PNG); inside a transaction, through it. */
  findGenerated(entityType: string, entityId: string): Promise<AttachmentRow[]> {
    return this.repository.liveOf(entityType, entityId);
  }
}
