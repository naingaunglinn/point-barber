// Document templates rendered by the API's DocumentRenderer (ADR-013): the fonts, the receipt paper and
// the base style; the receipt templates come with add-walkin-visit-checkout tasks 9.2 / 9.3.
export { receiptBaseCss, RECEIPT_BODY_PX } from './base-css.js';
export { DOCUMENT_FONT_FAMILY, fontFaceCss, fontFile } from './fonts.js';
export { type PaperWidthMm, PRINTER_WIDTH_PX } from './paper.js';
export { Receipt, type ReceiptProps, receiptHtml, receiptMarkup } from './receipt/receipt.js';
