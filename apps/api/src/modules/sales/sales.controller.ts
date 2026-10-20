import { Controller, Get, HttpCode, Param, Post, Res, StreamableFile } from '@nestjs/common';
import {
  ErrorCode,
  type FinishRequest,
  type PaymentCreate,
  type PaymentMethodDto,
  type ReasonBody,
  type ReceiptQuery,
  type ReceiptViewDto,
  type SaleDto,
  type SaleItemCreate,
  finishRequestSchema,
  paymentCreateSchema,
  reasonBodySchema,
  receiptQuerySchema,
  saleItemCreateSchema,
} from '@point/shared';
import type { Response } from 'express';

import { AccessContext } from '../../common/access/access-context.js';
import { Can, CanView, Staff } from '../../common/access/declarations.js';
import { toReadScope } from '../../common/access/read-scope.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ProblemException } from '../../common/http/problem.exception.js';
import { isUuid } from '../../common/http/uuid-v7.js';
import { ZBody, ZQuery } from '../../common/http/zod-validation.pipe.js';
import { Audited, IdempotencyKey, Idempotent } from '../platform/index.js';
import { SALE_FINISH, SalesFinish } from './finish/sales-finish.js';
import { SaleLines } from './lines/sale-lines.js';
import { SALE_ITEM_ADD, SALE_ITEM_REMOVE } from './lines/sales.js';
import { PAYMENT_ADD, PAYMENT_VOID, Payments } from './payments/payments.js';
import { type ReceiptFile, ReceiptReads } from './receipts/receipt-reads.js';
import { SaleView, type SaleViewer } from './view/sale-view.js';
import { SaleViewers } from './view/sale-viewers.js';

// The sale, payment and receipt endpoints of the walk-in (P4.SAL.02 / 04 / 06 / 10 · P4.PAY.02 / 03 ·
// P4.PMT.01 · P4.RCP.01 / 02 · add-walkin-visit-checkout design D2): one access declaration each; the
// entity routes find the sale's branch through SaleAccess. The receipts are operational reads — the
// service answers 404 outside the read scope.
const SALE_BRANCH = 'params.id→entity.branch_id';

@Controller('v1')
export class SalesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewers: SaleViewers,
    private readonly view: SaleView,
    private readonly lines: SaleLines,
    private readonly payments: Payments,
    private readonly finishing: SalesFinish,
    private readonly receipts: ReceiptReads,
  ) {}

  /** P4.SAL.02 — a reader of the sale (P4-RULE-03), or `sale.view⁺` at its branch. */
  @Get('sales/:id')
  @CanView('sale', { branch: SALE_BRANCH, orSelf: 'sale.readers' })
  async read(@Param('id') id: string): Promise<SaleDto> {
    return this.sale(await this.viewers.current(), id);
  }

  /** P4.SAL.04 — one SERVICE line, priced by the server; 200 Sale with the line's warnings. */
  @Post('sales/:id/items')
  @HttpCode(200)
  @Can('visit.update', { branch: SALE_BRANCH, orSelf: 'visit.lineActors' })
  @Audited({ actions: [SALE_ITEM_ADD] })
  async addItem(
    @Param('id') id: string,
    @ZBody(saleItemCreateSchema) body: SaleItemCreate,
  ): Promise<SaleDto> {
    const viewer = await this.viewers.current();
    const { sale_id, warnings } = await this.lines.add(viewer.actor, id, body);
    return this.sale(viewer, sale_id, warnings);
  }

  /** P4.SAL.06 — the row is kept with its reason (D-DAT-05). */
  @Post('sales/:id/items/:item_id/remove')
  @HttpCode(200)
  @Can('visit.update', { branch: SALE_BRANCH, orSelf: 'visit.lineActors' })
  @Audited({ actions: [SALE_ITEM_REMOVE] })
  async removeItem(
    @Param('id') id: string,
    @Param('item_id') itemId: string,
    @ZBody(reasonBodySchema) body: ReasonBody,
  ): Promise<SaleDto> {
    const viewer = await this.viewers.current();
    const { sale_id } = await this.lines.remove(viewer.actor, id, itemId, body.reason);
    return this.sale(viewer, sale_id);
  }

  /** P4.SAL.10 FINISH — a checkout actor, or `sale.finish_override` with `override_reason`. */
  @Post('sales/:id/finish')
  @HttpCode(200)
  @Can('sale.finish_override', { branch: SALE_BRANCH, orSelf: 'sale.checkoutActors' })
  @Audited({ actions: [SALE_FINISH] })
  async finish(
    @Param('id') id: string,
    @ZBody(finishRequestSchema) body: FinishRequest,
  ): Promise<SaleDto> {
    return this.finishing.finish(await this.viewers.current(), id, body);
  }

  /** P4.PAY.02 — 201 Sale; a replay of the key answers 200 (API-IDEM-01). */
  @Post('sales/:id/payments')
  @Can('sale.finish_override', { branch: SALE_BRANCH, orSelf: 'sale.checkoutActors' })
  @Idempotent()
  @Audited({ actions: [PAYMENT_ADD] })
  async addPayment(
    @Param('id') id: string,
    @ZBody(paymentCreateSchema) body: PaymentCreate,
    @IdempotencyKey() key: string,
  ): Promise<SaleDto> {
    return (await this.payments.add(await this.viewers.current(), id, body, key)).sale;
  }

  /** P4.PAY.03 — the row is kept with its reason and stops counting (D-DAT-05). */
  @Post('payments/:id/void')
  @HttpCode(200)
  @Can('sale.finish_override', { branch: SALE_BRANCH, orSelf: 'sale.checkoutActors' })
  @Audited({ actions: [PAYMENT_VOID] })
  async voidPayment(
    @Param('id') id: string,
    @ZBody(reasonBodySchema) body: ReasonBody,
  ): Promise<SaleDto> {
    return this.payments.void(await this.viewers.current(), id, body.reason);
  }

  /** P4.PMT.01 — the ACTIVE methods in `sort_order` (Cash first), for every staff member. */
  @Get('payment-methods')
  @Staff()
  methods(): Promise<{ items: PaymentMethodDto[] }> {
    return this.payments.activeMethods();
  }

  /** P4.RCP.01 — the receipt of a FINISHED sale: JSON, or the stored PDF / PNG. */
  @Get('sales/:id/receipt')
  @Staff()
  async saleReceipt(
    @Param('id') id: string,
    @ZQuery(receiptQuerySchema) query: ReceiptQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReceiptViewDto | StreamableFile> {
    if (!isUuid(id)) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    const scope = toReadScope(AccessContext.scope());
    return asResponse(await this.receipts.ofSale(scope, id, query.format, query.width), res);
  }

  /** P4.RCP.02 — the receipt of a refund (the change returned for an over-transfer). */
  @Get('refunds/:id/receipt')
  @Staff()
  async refundReceipt(
    @Param('id') id: string,
    @ZQuery(receiptQuerySchema) query: ReceiptQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReceiptViewDto | StreamableFile> {
    if (!isUuid(id)) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    const scope = toReadScope(AccessContext.scope());
    return asResponse(await this.receipts.ofRefund(scope, id, query.format, query.width), res);
  }

  private async sale(
    viewer: SaleViewer,
    id: string,
    warnings: Parameters<SaleView['build']>[3] = [],
  ): Promise<SaleDto> {
    const sale = await this.view.build(this.prisma, id, viewer, warnings);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return sale;
  }
}

/** A file in its own media type with `Content-Disposition` (API-SHAPE-05); JSON as it is. */
function asResponse(
  receipt: ReceiptViewDto | ReceiptFile,
  res: Response,
): ReceiptViewDto | StreamableFile {
  if (!('body' in receipt)) return receipt;
  res.setHeader('Content-Type', receipt.mime_type);
  return new StreamableFile(receipt.body, {
    type: receipt.mime_type,
    length: receipt.size_bytes,
    disposition: `inline; filename="${receipt.file_name}"`,
  });
}
