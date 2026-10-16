// Public surface of the `sales` module (CG-ARCH-01 · ADR-001 rule 1): other modules import only from
// here.
export { SalesModule } from './sales.module.js';
export { PaymentMethodSeed } from './seed/payment-method-seed.js';
export { type ActionRights, saleActions } from './actions/sale-actions.js';
export { SaleLines } from './lines/sale-lines.js';
export { SALE_ITEM_ADD, SALE_ITEM_REMOVE, Sales, assertSaleOpen } from './lines/sales.js';
export type { VisitForSale, VisitsPort } from './ports/visits-port.js';
export { VisitsRegistry } from './ports/visits-registry.js';
export type { SaleRow } from './repositories/sales.repository.js';
export { type SaleViewer, SaleView } from './view/sale-view.js';
export { PAYMENT_ADD, PAYMENT_VOID, Payments, toPaymentMethodDto } from './payments/payments.js';
export { CHANGE_RETURN_REASON, SALE_FINISH, SalesFinish } from './finish/sales-finish.js';
export { RECEIPT_RENDER, type ReceiptRenderData } from './receipts/receipt-render.job.js';
export {
  type ReceiptDocument,
  ReceiptFiles,
  type ReceiptFileSet,
} from './receipts/receipt-files.js';
export { type ReceiptSource, ReceiptViews } from './receipts/receipt-views.js';
export { type ReceiptFile, type ReceiptFormat, ReceiptReads } from './receipts/receipt-reads.js';
