import { Inject, Injectable } from '@nestjs/common';
import { AttachmentKind } from '@point/shared';
import type { Logger } from 'pino';

import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { LOGGER } from '../../../common/logging/logger.js';
import {
  type AttachmentRow,
  Attachments,
  DocumentRenderer,
  PRINTER_WIDTH_PX,
  type PaperWidthMm,
  ReceiptFilesLock,
  type RenderPriority,
  StorageService,
} from '../../platform/index.js';
import type { ReceiptRenderData } from './receipt-render.job.js';

// The stored files of a receipt (ADR-013 · ADR-014 · P4-RULE-18 · CG-DB-10 · add-walkin-visit-checkout
// design D10): one function for the `receipt.render` job and for `GET …/receipt?format=pdf|png`. No render
// and no bucket call runs inside a transaction: a short read; the render and the two puts outside any
// transaction; then a short transaction under `receipt:<entity_id>` that looks again and either stores
// the two rows or finds the set the other path stored — then this path's objects are deleted after the
// transaction. So exactly one PDF row and one PNG row exist per sale or refund.

/** What a receipt is rendered from: its HTML (packages/documents) and the facts of its rows. */
export interface ReceiptDocument {
  readonly html: string;
  /** The branch's `receipt.printer_width_mm` — the PDF's page width and the PNG's printer. */
  readonly width_mm: PaperWidthMm;
  /** The receipt number — the file name. */
  readonly number: string;
  readonly company_id: string;
  /** The finisher of the sale or the refunder (P4-RULE-18). */
  readonly uploaded_by_user_id: string;
}

export interface ReceiptFileSet {
  readonly pdf: AttachmentRow;
  readonly png: AttachmentRow;
}

const PDF = 'application/pdf';
const PNG = 'image/png';

function setOf(rows: readonly AttachmentRow[]): ReceiptFileSet | null {
  const generated = rows.filter((row) => row.kind === AttachmentKind.DOCUMENT);
  const pdf = generated.find((row) => row.mime_type === PDF);
  const png = generated.find((row) => row.mime_type === PNG);
  return pdf !== undefined && png !== undefined ? { pdf, png } : null;
}

@Injectable()
export class ReceiptFiles {
  constructor(
    private readonly attachments: Attachments,
    private readonly lock: ReceiptFilesLock,
    private readonly storage: StorageService,
    private readonly renderer: DocumentRenderer,
    private readonly runner: TransactionRunner,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** The stored set; rendered and stored first when there is none (`document` is built only then). */
  async ensure(
    entity: ReceiptRenderData,
    priority: RenderPriority,
    document: () => Promise<ReceiptDocument>,
  ): Promise<ReceiptFileSet> {
    const stored = setOf(
      await this.attachments.findGenerated(entity.entity_type, entity.entity_id),
    );
    if (stored !== null) return stored;

    const source = await document();
    const pdf = await this.renderer.renderPdf(source.html, { widthMm: source.width_mm }, priority);
    const png = await this.renderer.renderPng(
      source.html,
      PRINTER_WIDTH_PX[source.width_mm],
      priority,
    );
    const files = [
      { ...this.attachments.newGeneratedKey('pdf'), body: pdf, mime_type: PDF, ext: 'pdf' },
      { ...this.attachments.newGeneratedKey('png'), body: png, mime_type: PNG, ext: 'png' },
    ];
    const ownKeys = files.map((file) => file.storage_key);
    try {
      for (const file of files) await this.storage.put(file.storage_key, file.body, file.mime_type);
      const outcome = await this.runner.run(async (tx) => {
        await this.lock.acquire(tx, entity.entity_id);
        const other = setOf(
          await this.attachments.findGenerated(entity.entity_type, entity.entity_id),
        );
        if (other !== null) return { set: other, kept: false };
        const rows: AttachmentRow[] = [];
        for (const file of files) {
          rows.push(
            await this.attachments.storeGenerated(tx, {
              id: file.id,
              company_id: source.company_id,
              entity_type: entity.entity_type,
              entity_id: entity.entity_id,
              kind: AttachmentKind.DOCUMENT,
              file_name: `${source.number}.${file.ext}`,
              mime_type: file.mime_type,
              size_bytes: file.body.length,
              storage_key: file.storage_key,
              uploaded_by_user_id: source.uploaded_by_user_id,
            }),
          );
        }
        const [pdfRow, pngRow] = rows;
        if (pdfRow === undefined || pngRow === undefined)
          throw new Error('receipt rows not stored');
        return { set: { pdf: pdfRow, png: pngRow }, kept: true };
      });
      // The other path stored its set first: this path's objects belong to no row.
      if (!outcome.kept) await this.remove(ownKeys);
      return outcome.set;
    } catch (error) {
      await this.remove(ownKeys);
      throw error;
    }
  }

  private async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await this.storage.delete(key).catch((error: unknown) => {
        // An orphan object is harmless to the receipt but costs space: logged, never swallowed.
        this.log.error({ err: error, storage_key: key }, 'receipt object not deleted');
      });
    }
  }
}
