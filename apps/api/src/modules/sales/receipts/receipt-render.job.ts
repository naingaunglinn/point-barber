// The `receipt.render` job (ADR-002 · ADR-013 · add-walkin-visit-checkout design D10, task 2.13):
// FINISH sends it inside its transaction (design D5 step 17), so a rolled-back FINISH renders
// nothing; the worker (concurrency 1, 3 attempts) calls ReceiptFiles.ensure, the same function as
// `GET …/receipt?format=pdf|png`. The data names the row only — no amount, name or phone.

export const RECEIPT_RENDER = 'receipt.render';

export interface ReceiptRenderData {
  /** The attachments `entity_type` of the receipt: a sale, or a refund (the RF series). */
  readonly entity_type: 'sales' | 'refunds';
  readonly entity_id: string;
}
