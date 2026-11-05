import { buffer } from 'node:stream/consumers';

import { Inject, Injectable } from '@nestjs/common';
import type { ReceiptLogo as ReceiptLogoImage } from '@point/documents';
import { AttachmentKind } from '@point/shared';
import type { Logger } from 'pino';

import { isUuid } from '../../../common/http/uuid-v7.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { Attachments, StorageObjectMissing, StorageService } from '../../platform/index.js';

// The company logo of a receipt (AD-RCPT-01 item 1 · ADR-013 decision 1 · ADR-014 · P8-RULE-04 ·
// add-company-profile design D7). The renderer fetches nothing, so the logo is read here — outside any
// transaction, like every render input — and passed inline: the `w800.webp` variant next to the
// original of the live company image, as a data URI. A missing row or object prints the receipt
// without the logo and logs a warning; the weekly integrity check of ADR-014 reports the object. The
// sale and its receipt are never blocked by the logo.

/** P8-RULE-04 — the stable path `companies.logo_url` holds. */
const STABLE_PATH = /^\/api\/v1\/public\/media\/([^/]+)\/original$/;
/** ADR-014 — the variant the receipt prints. */
const VARIANT = 'w800.webp';
const MISSING = 'receipt.logo_missing';

@Injectable()
export class ReceiptLogo {
  constructor(
    private readonly attachments: Attachments,
    private readonly storage: StorageService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** The logo to draw for `logoUrl` (the company's `logo_url`), or null for none. */
  async load(logoUrl: string | null): Promise<ReceiptLogoImage | null> {
    if (logoUrl === null) return null;
    const id = STABLE_PATH.exec(logoUrl)?.[1];
    if (id === undefined || !isUuid(id)) {
      this.log.warn({ logo_url: logoUrl }, MISSING);
      return null;
    }
    const row = await this.attachments.findLive(id);
    if (row === null || row.entity_type !== 'companies' || row.kind !== AttachmentKind.IMAGE) {
      this.log.warn({ attachment_id: id }, MISSING);
      return null;
    }
    const key = row.storage_key.replace(/[^/]+$/, VARIANT);
    try {
      const body = await buffer(await this.storage.getStream(key));
      return { dataUri: `data:image/webp;base64,${body.toString('base64')}` };
    } catch (error) {
      if (!(error instanceof StorageObjectMissing)) throw error;
      this.log.warn({ attachment_id: id }, MISSING);
      return null;
    }
  }
}
