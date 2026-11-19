import { DOCUMENT_FONT_FAMILY, fontFaceCss } from './fonts.js';
import { type PaperWidthMm, PRINTER_WIDTH_PX } from './paper.js';

// The base style of a receipt (ADR-013 · AD-RCPT-02): the page is the printer's width in CSS pixels
// (one pixel per dot), black on white for a 1-bit print, body text 22 px — at least 22 px at 384 px
// (AD-RCPT-02), and the same size at 576 px, where a dot is the same size. Myanmar stacked consonants
// need the taller line height.

/** Body text size in CSS pixels = printer dots (AD-RCPT-02: at least 22 px at 384 px). */
export const RECEIPT_BODY_PX = 22;

export function receiptBaseCss(paper: PaperWidthMm): string {
  const width = PRINTER_WIDTH_PX[paper];
  return [
    fontFaceCss(),
    '*,*::before,*::after{box-sizing:border-box}',
    'html,body{margin:0;padding:0;background:white;color:black}',
    `body{width:${width}px;font-family:${DOCUMENT_FONT_FAMILY};font-size:${RECEIPT_BODY_PX}px;` +
      'font-weight:400;line-height:1.45;font-variant-numeric:tabular-nums;' +
      '-webkit-font-smoothing:none;overflow-wrap:anywhere}',
  ].join('\n');
}
