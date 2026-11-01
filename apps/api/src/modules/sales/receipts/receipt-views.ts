import { Injectable } from '@nestjs/common';
import { type PaperWidthMm, PRINTER_WIDTH_PX, receiptHtml } from '@point/documents';
import labels from '@point/i18n/messages/en/receipt.json' with { type: 'json' };
import {
  ErrorCode,
  type Mmk,
  RefundKind,
  type ReceiptLineDto,
  type ReceiptViewDto,
  SaleStatus,
  moneyToWire,
  toMmtIso,
} from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Customers } from '../../booking/index.js';
import { BranchHeaders, DisplayNames } from '../../people/index.js';
import { OpeningHours, SettingsReader } from '../../platform/index.js';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { RefundsRepository } from '../repositories/refunds.repository.js';
import { SaleItemsRepository } from '../repositories/sale-items.repository.js';
import { type SaleRow, SalesRepository } from '../repositories/sales.repository.js';
import { openingHoursLine } from './opening-hours-line.js';
import { type ReceiptDocument, type ReceiptFileSet, ReceiptFiles } from './receipt-files.js';
import type { ReceiptRenderData } from './receipt-render.job.js';

// `ReceiptView` (P4.RCP.01 / .02 `format=json` · AD-RCPT-01 · OPEN-32 · add-walkin-visit-checkout design
// D10, tasks 9.9 / 9.10): what a receipt prints, built from the sale or the refund and from the branch as
// it is now — English always: employees, payment methods, branch and company in English with the Myanmar
// fallback (AD-L10N-03), whatever the caller's language; lines from `description_en` else
// `description_mm`; the customer's phone masked. The same view, with the company name, is the input of
// the receipt template, so the stored PDF and PNG print what `format=json` shows at that moment.

/** A built receipt and the facts its stored files need. */
export interface ReceiptSource {
  readonly view: ReceiptViewDto;
  /** The company name the template prints (the view has no company member). */
  readonly company: string;
  readonly company_id: string;
  readonly branch_id: string;
  /** The finisher of the sale or the refunder — `uploaded_by` of the stored files (P4-RULE-18). */
  readonly issued_by_user_id: string;
}

const wire = (amount: bigint): number => moneyToWire(amount as Mmk);
const methodName = (method: { name_en: string | null; name_mm: string }) =>
  method.name_en !== null && method.name_en.trim() !== '' ? method.name_en : method.name_mm;

@Injectable()
export class ReceiptViews {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesRepository,
    private readonly items: SaleItemsRepository,
    private readonly payments: PaymentsRepository,
    private readonly refunds: RefundsRepository,
    private readonly customers: Customers,
    private readonly names: DisplayNames,
    private readonly branches: BranchHeaders,
    private readonly hours: OpeningHours,
    private readonly settings: SettingsReader,
    private readonly files: ReceiptFiles,
  ) {}

  /** The receipt of a sale; null when there is none; 409 unless the sale is FINISHED. */
  async ofSale(db: Tx, saleId: string): Promise<ReceiptSource | null> {
    const sale = await this.sales.find(db, saleId);
    if (sale === null) return null;
    if (
      sale.status !== SaleStatus.FINISHED ||
      sale.receipt_number === null ||
      sale.finished_by_user_id === null
    ) {
      throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, {
        context: { status: sale.status },
      });
    }
    const [items, payments, refunds, header, footer, stored] = await Promise.all([
      this.items.ofSale(db, sale.id),
      this.payments.ofSale(db, sale.id),
      this.refunds.ofSale(db, sale.id),
      this.branches.englishOf(db, sale.branch_id),
      this.footer(sale.branch_id),
      this.files.stored({ entity_type: 'sales', entity_id: sale.id }),
    ]);
    const active = items.filter((item) => item.removed_at === null);
    const performers = await this.names.ofEmployees(
      active.map((item) => item.performed_by_employee_id).filter((id): id is string => id !== null),
      'en',
    );
    const lines: ReceiptLineDto[] = active.map((item) => ({
      description_en: item.description_en,
      description_mm: item.description_mm,
      // No option snapshot exists on a line in this change (no variant is sold yet).
      option: null,
      performer:
        item.performed_by_employee_id === null
          ? null
          : (performers.get(item.performed_by_employee_id) ?? null),
      quantity: item.quantity,
      unit_price_amount: wire(item.unit_price_amount),
      amount: wire(item.line_total_amount ?? 0n),
    }));
    const barbers = [...new Set(lines.map((line) => line.performer))].filter(
      (name): name is string => name !== null,
    );
    const customer =
      sale.customer_id === null ? null : await this.customers.forReceipt(db, sale.customer_id);
    // The change of an over-transfer, written by FINISH at its finish time (owner B5).
    const change = refunds.find(
      (refund) =>
        refund.kind === RefundKind.OVERPAYMENT_RETURN &&
        refund.refunded_at.getTime() === sale.finished_at?.getTime(),
    );
    return {
      view: {
        kind: 'sale',
        number: sale.receipt_number,
        original_number: null,
        issued_at: toMmtIso(sale.finished_at ?? sale.updated_at),
        branch: { name: header.name, address: header.address, phone: header.phone, logo_url: null },
        barbers,
        customer_name: customer?.name ?? null,
        customer_phone_masked: customer?.phone_masked ?? null,
        lines,
        subtotal_amount: wire(sale.subtotal_amount),
        // No discount exists in this change (add-discounts).
        discount_label: null,
        discount_amount: wire(sale.discount_amount),
        ...this.charges(sale),
        total_amount: wire(sale.total_amount),
        payments: payments
          .filter((payment) => payment.voided_at === null)
          .map((payment) => ({
            method: methodName(payment.method),
            amount: wire(payment.amount),
            reference: payment.external_reference,
          })),
        change_returned:
          change === undefined
            ? null
            : { amount: wire(change.amount), refund_receipt_number: change.refund_receipt_number },
        footer,
        ...files(stored),
      },
      company: header.company_name,
      company_id: header.company_id,
      branch_id: sale.branch_id,
      issued_by_user_id: sale.finished_by_user_id,
    };
  }

  /**
   * The receipt of a refund; null when there is none. Same template: the RF number, the original
   * receipt number, the method and the amount; an automatic change return has no lines (the only
   * refund this change writes).
   */
  async ofRefund(db: Tx, refundId: string): Promise<ReceiptSource | null> {
    const refund = await this.refunds.find(db, refundId);
    if (refund === null) return null;
    const sale = await this.sales.find(db, refund.sale_id);
    if (sale === null) throw new Error(`refund ${refund.id} has no sale`);
    const [header, footer, stored] = await Promise.all([
      this.branches.englishOf(db, refund.branch_id),
      this.footer(refund.branch_id),
      this.files.stored({ entity_type: 'refunds', entity_id: refund.id }),
    ]);
    const amount = wire(refund.amount);
    return {
      view: {
        kind: 'refund',
        number: refund.refund_receipt_number,
        original_number: sale.receipt_number,
        issued_at: toMmtIso(refund.refunded_at),
        branch: { name: header.name, address: header.address, phone: header.phone, logo_url: null },
        barbers: [],
        customer_name: null,
        customer_phone_masked: null,
        lines: [],
        subtotal_amount: amount,
        discount_label: null,
        discount_amount: 0,
        service_charge_amount: null,
        tax_amount: null,
        total_amount: amount,
        payments: [
          { method: methodName(refund.method), amount, reference: refund.external_reference },
        ],
        change_returned: null,
        footer,
        ...files(stored),
      },
      company: header.company_name,
      company_id: header.company_id,
      branch_id: refund.branch_id,
      issued_by_user_id: refund.refunded_by_user_id,
    };
  }

  /** The input of ReceiptFiles.ensure: the template at the branch's printer width (design D10 step 2). */
  async document(entity: ReceiptRenderData): Promise<ReceiptDocument> {
    const source =
      entity.entity_type === 'sales'
        ? await this.ofSale(this.prisma, entity.entity_id)
        : await this.ofRefund(this.prisma, entity.entity_id);
    if (source === null) throw new Error(`no ${entity.entity_type} row ${entity.entity_id}`);
    const paper = await this.paperOf(source.branch_id);
    return {
      html: receiptHtml({ view: source.view, company: source.company, paper }),
      width_mm: paper,
      number: source.view.number,
      company_id: source.company_id,
      uploaded_by_user_id: source.issued_by_user_id,
    };
  }

  /** The branch's `receipt.printer_width_mm` (default 58 — owner H (2)). */
  async paperOf(branchId: string): Promise<PaperWidthMm> {
    const width = (await this.settings.effective(['receipt.printer_width_mm'], branchId))[
      'receipt.printer_width_mm'
    ];
    if (!(width in PRINTER_WIDTH_PX)) throw new Error(`no printer width for ${String(width)} mm`);
    return width as PaperWidthMm;
  }

  private async footer(branchId: string): Promise<ReceiptViewDto['footer']> {
    const days = await this.hours.ofBranch(branchId);
    // `receipt.thank_you_text` has no value before add-settings-store (proposal: no thank-you line).
    return { opening_hours: openingHoursLine(days, labels.closed), thank_you: null };
  }

  /** Service charge and tax lines only where the sale charged them (AD-RCPT-01 item 6). */
  private charges(sale: SaleRow): Pick<ReceiptViewDto, 'service_charge_amount' | 'tax_amount'> {
    return {
      service_charge_amount: sale.service_charge_rate.isZero()
        ? null
        : wire(sale.service_charge_amount),
      tax_amount: sale.tax_rate.isZero() ? null : wire(sale.tax_amount),
    };
  }
}

function files(
  stored: ReceiptFileSet | null,
): Pick<ReceiptViewDto, 'pdf_attachment_id' | 'png_attachment_id' | 'rendered_at'> {
  return {
    pdf_attachment_id: stored?.pdf.id ?? null,
    png_attachment_id: stored?.png.id ?? null,
    rendered_at: stored === null ? null : toMmtIso(stored.pdf.uploaded_at),
  };
}
