import type { RenderPriority } from './render-queue.js';

// One server-side renderer of documents (ADR-013): an HTML string from the templates of
// packages/documents (every value escaped) → a PDF of the paper width, or a 2-colour PNG at the
// printer's width (58 mm → 384 px, 80 mm → 576 px). No render runs inside a database transaction.

export interface PdfPage {
  /** The paper width; the height follows the content. */
  readonly widthMm: number;
}

export abstract class DocumentRenderer {
  abstract renderPdf(html: string, page: PdfPage, priority?: RenderPriority): Promise<Buffer>;
  /** A 2-colour palette PNG, `widthPx` wide, as tall as the content. */
  abstract renderPng(html: string, widthPx: number, priority?: RenderPriority): Promise<Buffer>;
}
