import { z } from 'zod';

import {
  DiscountRequestStatus,
  DiscountType,
  LateEntryReason,
  LocationType,
  PaymentMethodKind,
  PaymentMethodStatus,
  ProxyReason,
  RefundKind,
  SaleAdjustmentType,
  SaleItemLineType,
  SaleStatus,
  VisitStatus,
} from '../constants/status.js';
import {
  codeOf,
  employeeRefSchema,
  userRefSchema,
  wireAmount,
  wireDate,
  wireDateTime,
  wirePositiveAmount,
} from './wire.js';

// The visit, sale and payment DTOs of add-walkin-visit-checkout (tasks 2.2 – 2.4, 2.6), one per
// schema of point-sdd docs/api/openapi/part4-visits-sales-payments.yaml v1.2 (API-ERR-03). Response
// schemas are strict; their types end in `Dto` because amounts are wire integers here, while the
// client-side shapes of shapes.ts (ReceiptView, ReceiptLine) carry Mmk. The nested schemas a Sale
// holds (SaleDiscount, DiscountRequest, SaleAdjustment, CommissionEstimate) are written whole so the
// Sale equals its contract; in this change they are always null or empty.

const paymentMethodRefSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  kind: codeOf(PaymentMethodKind),
});

/** `SaleItem` — one sale line; prices are snapshots (P4-RULE-04 · D-SVC-08). */
export const saleItemSchema = z.strictObject({
  id: z.uuid(),
  sort_order: z.int(),
  line_type: codeOf(SaleItemLineType),
  service_id: z.uuid().nullable(),
  service_variant_id: z.uuid().nullable(),
  product_id: z.uuid().nullable(),
  booking_item_id: z.uuid().nullable(),
  performed_by: employeeRefSchema.nullable(),
  effective_performed_by: employeeRefSchema.nullable(),
  description_mm: z.string(),
  description_en: z.string().nullable(),
  quantity: z.int().min(1),
  list_price_amount: wireAmount,
  unit_price_amount: wireAmount,
  price_overridden: z.boolean(),
  price_override_reason: z.string().nullable(),
  price_override_by: userRefSchema.nullable(),
  line_discount_amount: wireAmount,
  line_total_amount: wireAmount,
  refunded_amount: wireAmount,
  added_reason: z.string().nullable(),
  removed_at: wireDateTime.nullable(),
  removed_by: userRefSchema.nullable(),
  removed_reason: z.string().nullable(),
});

/** `Payment` — `effective_*` after PAYMENT_METHOD / COLLECTED_BY adjustments (P4-RULE-15). */
export const paymentSchema = z.strictObject({
  id: z.uuid(),
  sale_id: z.uuid(),
  payment_method: paymentMethodRefSchema,
  effective_payment_method: paymentMethodRefSchema,
  amount: wirePositiveAmount,
  external_reference: z.string().nullable(),
  collected_by: employeeRefSchema,
  effective_collected_by: employeeRefSchema,
  received_at: wireDateTime,
  recorded_by: userRefSchema,
  requires_verification: z.boolean(),
  verified_at: wireDateTime.nullable(),
  verified_by: userRefSchema.nullable(),
  voided_at: wireDateTime.nullable(),
  voided_by: userRefSchema.nullable(),
  void_reason: z.string().nullable(),
  created_at: wireDateTime,
});

/** `PaymentMethod` — P4.PMT.01 (D-PAY-01 · D-PAY-02). */
export const paymentMethodSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  kind: codeOf(PaymentMethodKind),
  is_cash: z.boolean(),
  requires_reference: z.boolean(),
  requires_verification: z.boolean(),
  reference_regex: z.string().nullable(),
  is_system: z.boolean(),
  sort_order: z.int(),
  status: codeOf(PaymentMethodStatus),
  archived_at: wireDateTime.nullable(),
  updated_at: wireDateTime,
});

/** `RefundSummary` — a refund of a sale, or the change of an over-transfer (D-PAY-05). */
export const refundSummarySchema = z.strictObject({
  id: z.uuid(),
  kind: codeOf(RefundKind),
  amount: wirePositiveAmount,
  refund_receipt_number: z.string(),
  refunded_at: wireDateTime,
  automatic_change: z.boolean(),
});

/** `SaleActions` — what the caller may do now (AD-PERM-02); the API still decides. */
export const saleActionsSchema = z.strictObject({
  edit_lines: z.boolean(),
  take_payment: z.boolean(),
  finish: z.boolean(),
  finish_needs_reason: z.boolean(),
  override_price: z.boolean(),
  mark_incomplete: z.boolean(),
  request_discount: z.boolean(),
  refund: z.boolean(),
  adjust: z.boolean(),
});

/** `Warning` — e.g. `not_eligible`, `customer_restored`; never a refusal. */
export const warningSchema = z.strictObject({
  code: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** `SaleDiscount` — the applied discount (a code or an approved request). */
export const saleDiscountSchema = z.strictObject({
  source: z.enum(['code', 'request']),
  discount_code_id: z.uuid().nullable(),
  code: z.string().nullable(),
  code_name_mm: z.string().nullable(),
  code_name_en: z.string().nullable(),
  discount_request_id: z.uuid().nullable(),
  discount_type: codeOf(DiscountType),
  discount_percent: z.int().min(1).max(100).nullable(),
  discount_value_amount: wireAmount.nullable(),
  eligible_amount: wireAmount,
  rounded_to_amount: z.int(),
});

/** `DiscountRequest` — P4.DRQ (D-PAY-04). */
export const discountRequestSchema = z.strictObject({
  id: z.uuid(),
  sale_id: z.uuid(),
  branch_id: z.uuid(),
  requested_by: userRefSchema,
  requested_at: wireDateTime,
  discount_type: codeOf(DiscountType),
  discount_percent: z.int().nullable(),
  discount_amount: wireAmount.nullable(),
  reason: z.string(),
  status: codeOf(DiscountRequestStatus),
  decided_by: userRefSchema.nullable(),
  decided_at: wireDateTime.nullable(),
  decision_note: z.string().nullable(),
  applied: z.boolean(),
  sale_summary: z.strictObject({
    performed_by: employeeRefSchema.nullable(),
    items_label_mm: z.string(),
    items_label_en: z.string().nullable(),
    subtotal_amount: wireAmount,
    eligible_amount: wireAmount,
    resulting_discount_amount: wireAmount,
    resulting_total_amount: wireAmount,
    sale_status: codeOf(SaleStatus),
  }),
  updated_at: wireDateTime,
});

/** `SaleAdjustment` — a correction of a FINISHED sale (F-P4-07). */
export const saleAdjustmentSchema = z.strictObject({
  id: z.uuid(),
  sale_id: z.uuid(),
  adjustment_type: codeOf(SaleAdjustmentType),
  payment_id: z.uuid().nullable(),
  sale_item_id: z.uuid().nullable(),
  new_payment_method: paymentMethodRefSchema.nullable(),
  new_employee: employeeRefSchema.nullable(),
  reason: z.string(),
  difference_sale_id: z.uuid().nullable(),
  adjusted_by: userRefSchema,
  adjusted_at: wireDateTime,
});

/** `CommissionEstimate` — Part 5 Commission.estimate (P4-RULE-20). */
export const commissionEstimateSchema = z.strictObject({
  estimate_amount: wireAmount,
  base_amount: wireAmount,
  month_to_date_base_amount: wireAmount,
  note: z.literal('final_at_month_end'),
});

/** `Sale` — the whole sale, the answer of every sale write (P4.SAL.02). */
export const saleSchema = z.strictObject({
  id: z.uuid(),
  branch_id: z.uuid(),
  visit_id: z.uuid().nullable(),
  kind: z.enum(['service', 'product_only', 'difference']),
  status: codeOf(SaleStatus),
  customer: z.strictObject({ id: z.uuid(), name: z.string(), phone: z.string() }).nullable(),
  items: z.array(saleItemSchema),
  subtotal_amount: wireAmount,
  discount_amount: wireAmount,
  discount: saleDiscountSchema.nullable(),
  pending_discount_request: discountRequestSchema.nullable(),
  service_charge_rate: z.number().min(0).max(100),
  service_charge_amount: wireAmount,
  tax_rate: z.number().min(0).max(100),
  tax_amount: wireAmount,
  total_amount: wireAmount,
  paid_amount: wireAmount,
  remaining_amount: wireAmount,
  change_due_amount: wireAmount,
  payments: z.array(paymentSchema),
  receipt_number: z.string().nullable(),
  business_date: wireDate.nullable(),
  finished_at: wireDateTime.nullable(),
  finished_by: userRefSchema.nullable(),
  cancelled_at: wireDateTime.nullable(),
  refunds: z.array(refundSummarySchema),
  refunded_amount: wireAmount,
  adjustments: z.array(saleAdjustmentSchema),
  commission_estimate: commissionEstimateSchema.nullable(),
  difference_of: z
    .strictObject({ sale_id: z.uuid(), sale_item_id: z.uuid(), receipt_number: z.string() })
    .nullable(),
  actions: saleActionsSchema,
  warnings: z.array(warningSchema),
  created_at: wireDateTime,
  updated_at: wireDateTime,
});

/** `Visit` — with its `sale` (P4.VIS.02 – .06). */
export const visitSchema = z.strictObject({
  id: z.uuid(),
  branch_id: z.uuid(),
  booking_id: z.uuid().nullable(),
  status: codeOf(VisitStatus),
  performed_by: employeeRefSchema,
  booked_employee: employeeRefSchema.nullable(),
  performer_change_reason: z.string().nullable(),
  proxy_reason: codeOf(ProxyReason).nullable(),
  started_by: userRefSchema,
  location_type: codeOf(LocationType),
  home_address: z.string().nullable(),
  started_at: wireDateTime,
  completed_at: wireDateTime.nullable(),
  completed_by: userRefSchema.nullable(),
  finished_at: wireDateTime.nullable(),
  incomplete_at: wireDateTime.nullable(),
  incomplete_by: userRefSchema.nullable(),
  incomplete_reason: z.string().nullable(),
  is_late_entry: z.boolean(),
  late_entry_reason: codeOf(LateEntryReason).nullable(),
  late_entry_note: z.string().nullable(),
  business_date: wireDate,
  recorded_at: wireDateTime,
  updated_at: wireDateTime,
  sale: saleSchema,
  warnings: z.array(warningSchema),
});

/** `ReceiptLine` — the English description, the Myanmar one as its fallback (AD-RCPT-01). */
export const receiptLineSchema = z.strictObject({
  description_en: z.string().nullable(),
  description_mm: z.string(),
  option: z.string().nullable(),
  performer: z.string().nullable(),
  quantity: z.int(),
  unit_price_amount: wireAmount,
  amount: wireAmount,
});

/** `ReceiptView` — P4.RCP.01 / .02 `format=json`, always English (D-PLT-03 · AD-RCPT-01). */
export const receiptViewSchema = z.strictObject({
  kind: z.enum(['sale', 'refund']),
  number: z.string(),
  original_number: z.string().nullable(),
  issued_at: wireDateTime,
  branch: z.strictObject({
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    logo_url: z.string().nullable(),
  }),
  barbers: z.array(z.string()),
  customer_name: z.string().nullable(),
  customer_phone_masked: z.string().nullable(),
  lines: z.array(receiptLineSchema),
  subtotal_amount: wireAmount,
  discount_label: z.string().nullable(),
  discount_amount: wireAmount,
  service_charge_amount: wireAmount.nullable(),
  tax_amount: wireAmount.nullable(),
  total_amount: wireAmount,
  payments: z.array(
    z.strictObject({ method: z.string(), amount: wireAmount, reference: z.string().nullable() }),
  ),
  change_returned: z
    .strictObject({ amount: wireAmount, refund_receipt_number: z.string() })
    .nullable(),
  footer: z.strictObject({
    opening_hours: z.string().nullable(),
    thank_you: z.string().nullable(),
  }),
  pdf_attachment_id: z.uuid().nullable(),
  png_attachment_id: z.uuid().nullable(),
  rendered_at: wireDateTime.nullable(),
});

/** `RequestLookup` — P4.REQ.01: what an `Idempotency-Key` created (API-IDEM-02). */
export const requestLookupSchema = z.strictObject({
  client_request_id: z.uuid(),
  resource_type: z.enum(['visit', 'sale', 'payment', 'refund', 'stock_movement']),
  id: z.uuid(),
  sale_id: z.uuid().nullable(),
  visit_id: z.uuid().nullable(),
});

// Request schemas (task 2.6) — plain z.object, so unknown members are stripped, never refused
// (CG-API-03): a client-sent price or total has no effect (API-DATA-02). Only the members this
// change builds (design D12); the late-entry, proxy, booking and product members come with their
// changes. A blank reason is the service's 400 `reason_required` (API-DATA-11), not `validation`.

/** A free-text reason: at most 1,000 characters; blank or missing is checked by the service. */
const reasonText = z.string().max(1000);

/** P4.VIS.03 START (walk-in): the performer is the caller, the location the branch. */
export const startVisitRequestSchema = z.object({
  branch_id: z.uuid(),
  items: z.array(z.object({ service_id: z.uuid() })).optional(),
});

/** P4.SAL.04 add a line: one SERVICE line, priced by the server. */
export const saleItemCreateSchema = z.object({
  line_type: z.literal(SaleItemLineType.SERVICE),
  service_id: z.uuid(),
  added_reason: reasonText.nullish(),
});

/** `ReasonBody` — line removal, payment void, INCOMPLETE. */
export const reasonBodySchema = z.object({ reason: reasonText.nullish() });

/** P4.PAY.02 add a payment: whole MMK ≥ 1 (D-PLT-04). */
export const paymentCreateSchema = z.object({
  payment_method_id: z.uuid(),
  amount: wirePositiveAmount,
  // Trimmed before any check (payments spec), so a pasted reference with a trailing space fits.
  external_reference: z.string().trim().max(100).nullish(),
  collected_by_employee_id: z.uuid().nullish(),
});

/** P4.SAL.10 FINISH: the total on the Finish button, the customer or Skip, the override reason. */
export const finishRequestSchema = z.object({
  expected_total_amount: wireAmount,
  customer: z.object({ phone: z.string().max(50), name: z.string().max(255).nullish() }).nullish(),
  override_reason: reasonText.nullish(),
});

/** A repeatable query member (`status=1&status=2`): one value arrives as a string, several as a list. */
const repeated = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => (Array.isArray(value) ? value : [value]), z.array(item));

/**
 * P4.VIS.02 query: `status` repeatable, `date` a business date. With neither, the service answers the
 * default — the open visits (1, 2) of any date plus today's FINISHED and INCOMPLETE ones.
 */
export const myVisitsQuerySchema = z.object({
  // Digits only: `?status=` or a blank is a 400, never status 0 (INCOMPLETE).
  status: repeated(
    z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(VisitStatus)),
  ).optional(),
  date: wireDate.optional(),
});

/** P4.RCP.01 / .02 query: `format` default `json`; `width` default = the branch setting. */
export const receiptQuerySchema = z.object({
  format: z.enum(['json', 'pdf', 'png']).default('json'),
  width: z.coerce
    .number()
    .pipe(z.literal([58, 80]))
    .optional(),
});

export type SaleItemDto = z.infer<typeof saleItemSchema>;
export type PaymentDto = z.infer<typeof paymentSchema>;
export type PaymentMethodDto = z.infer<typeof paymentMethodSchema>;
export type RefundSummaryDto = z.infer<typeof refundSummarySchema>;
export type SaleActionsDto = z.infer<typeof saleActionsSchema>;
export type WarningDto = z.infer<typeof warningSchema>;
export type SaleDto = z.infer<typeof saleSchema>;
export type VisitDto = z.infer<typeof visitSchema>;
export type ReceiptLineDto = z.infer<typeof receiptLineSchema>;
export type ReceiptViewDto = z.infer<typeof receiptViewSchema>;
export type RequestLookupDto = z.infer<typeof requestLookupSchema>;
export type StartVisitRequest = z.infer<typeof startVisitRequestSchema>;
export type SaleItemCreate = z.infer<typeof saleItemCreateSchema>;
export type ReasonBody = z.infer<typeof reasonBodySchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type FinishRequest = z.infer<typeof finishRequestSchema>;
export type MyVisitsQuery = z.infer<typeof myVisitsQuerySchema>;
export type ReceiptQuery = z.infer<typeof receiptQuerySchema>;
