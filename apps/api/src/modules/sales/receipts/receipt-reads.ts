import { Readable } from 'node:stream';

import { Injectable } from '@nestjs/common';
import { type PaperWidthMm, PRINTER_WIDTH_PX, receiptHtml } from '@point/documents';
import { ErrorCode, type ReceiptViewDto } from '@point/shared';

import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { DocumentRenderer, StorageService } from '../../platform/index.js';
import { RefundsRepository } from '../repositories/refunds.repository.js';
import { SalesRepository } from '../repositories/sales.repository.js';
import { ReceiptFiles } from './receipt-files.js';
import type { ReceiptRenderData } from './receipt-render.job.js';
import { type ReceiptSource, ReceiptViews } from './receipt-views.js';

// What `GET /v1/sales/{id}/receipt` and `GET /v1/refunds/{id}/receipt` answer (P4.RCP.01 / .02 ·
// P4-RULE-18 · D-PAY-06 · add-walkin-visit-checkout design D10), ahead of their controllers: `format=json`
// → the ReceiptView built now; `pdf` / `png` → the stored file, streamed as it was stored (rendered and
// stored first through ReceiptFiles.ensure when the job has not run yet, as an interactive render); a
// `width` other than the branch's `receipt.printer_width_mm` → rendered now from the current data and
// not stored. The endpoints are `@Staff()` (design D2): a sale or refund of a branch outside the caller's
// read scope answers 404 `not_found`, like no row, before anything is rendered or stored; a sale that is not
// FINISHED → 409 `invalid_transition`.

export type ReceiptFormat = 'pdf' | 'png' | 'json';

export interface ReceiptFile {
  readonly body: Readable;
  readonly mime_type: string;
  readonly file_name: string;
  readonly size_bytes: number;
}

const MIME = { pdf: 'application/pdf', png: 'image/png' } as const;

@Injectable()
export class ReceiptReads {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesRepository,
    private readonly refunds: RefundsRepository,
    private readonly views: ReceiptViews,
    private readonly files: ReceiptFiles,
    private readonly storage: StorageService,
    private readonly renderer: DocumentRenderer,
  ) {}

  ofSale(
    scope: ReadScope,
    saleId: string,
    format: ReceiptFormat,
    width?: PaperWidthMm,
  ): Promise<ReceiptViewDto | ReceiptFile> {
    return this.read(scope, { entity_type: 'sales', entity_id: saleId }, format, width);
  }

  ofRefund(
    scope: ReadScope,
    refundId: string,
    format: ReceiptFormat,
    width?: PaperWidthMm,
  ): Promise<ReceiptViewDto | ReceiptFile> {
    return this.read(scope, { entity_type: 'refunds', entity_id: refundId }, format, width);
  }

  private async read(
    scope: ReadScope,
    entity: ReceiptRenderData,
    format: ReceiptFormat,
    width: PaperWidthMm | undefined,
  ): Promise<ReceiptViewDto | ReceiptFile> {
    const source = await this.source(scope, entity);
    if (format === 'json') return source.view;
    const paper = await this.views.paperOf(source.branch_id);
    if (width !== undefined && width !== paper) return this.renderNow(source, format, width);
    const set = await this.files.ensure(entity, 'interactive', () => this.views.document(entity));
    const row = format === 'pdf' ? set.pdf : set.png;
    return {
      body: await this.storage.getStream(row.storage_key),
      mime_type: row.mime_type,
      file_name: row.file_name,
      size_bytes: row.size_bytes,
    };
  }

  private async source(scope: ReadScope, entity: ReceiptRenderData): Promise<ReceiptSource> {
    // The scope first: a row of another branch is "not found", whatever its state.
    const row =
      entity.entity_type === 'sales'
        ? await this.sales.find(this.prisma, entity.entity_id)
        : await this.refunds.find(this.prisma, entity.entity_id);
    if (row === null || !inReadScope(scope, row.branch_id)) {
      throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    }
    const source =
      entity.entity_type === 'sales'
        ? await this.views.ofSale(this.prisma, entity.entity_id)
        : await this.views.ofRefund(this.prisma, entity.entity_id);
    if (source === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return source;
  }

  /** Another printer's width: drawn now from the current data, never stored (design D10). */
  private async renderNow(
    source: ReceiptSource,
    format: 'pdf' | 'png',
    paper: PaperWidthMm,
  ): Promise<ReceiptFile> {
    const html = receiptHtml({ view: source.view, company: source.company, paper });
    const body =
      format === 'pdf'
        ? await this.renderer.renderPdf(html, { widthMm: paper }, 'interactive')
        : await this.renderer.renderPng(html, PRINTER_WIDTH_PX[paper], 'interactive');
    return {
      body: Readable.from(body),
      mime_type: MIME[format],
      file_name: `${source.view.number}.${format}`,
      size_bytes: body.length,
    };
  }
}
