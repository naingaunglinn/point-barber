import { DocumentRenderer, type PdfPage } from './document-renderer.js';

// The DocumentRenderer of the unit and integration tests that do not test rendering itself
// (CG-ARCH-08): deterministic bytes that name what was asked for, no browser.
export class InMemoryDocumentRenderer extends DocumentRenderer {
  readonly calls: { kind: 'pdf' | 'png'; html: string; width: number }[] = [];

  override renderPdf(html: string, page: PdfPage): Promise<Buffer> {
    this.calls.push({ kind: 'pdf', html, width: page.widthMm });
    return Promise.resolve(Buffer.from(`%PDF-fake ${page.widthMm}mm ${html.length}`));
  }

  override renderPng(html: string, widthPx: number): Promise<Buffer> {
    this.calls.push({ kind: 'png', html, width: widthPx });
    return Promise.resolve(Buffer.from(`PNG-fake ${widthPx}px ${html.length}`));
  }
}
