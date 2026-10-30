import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ErrorCode,
  type ReasonBody,
  type SaleDto,
  type SaleItemCreate,
  reasonBodySchema,
  saleItemCreateSchema,
} from '@point/shared';

import { Can } from '../../common/access/declarations.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ProblemException } from '../../common/http/problem.exception.js';
import { ZBody } from '../../common/http/zod-validation.pipe.js';
import { Audited } from '../platform/index.js';
import { SaleLines } from './lines/sale-lines.js';
import { SALE_ITEM_ADD, SALE_ITEM_REMOVE } from './lines/sales.js';
import { SaleView, type SaleViewer } from './view/sale-view.js';
import { SaleViewers } from './view/sale-viewers.js';

// The sale endpoints of the walk-in (P4.SAL.02 / 04 / 06 · add-walkin-visit-checkout design D2): one
// access declaration each; the entity routes find the sale's branch through SaleAccess.
const SALE_BRANCH = 'params.id→entity.branch_id';

@Controller('v1')
export class SalesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewers: SaleViewers,
    private readonly view: SaleView,
    private readonly lines: SaleLines,
  ) {}

  /**
   * P4.SAL.02 — a reader of the sale (P4-RULE-03), or `sale.view` itself at its branch: the seed
   * Barber codes `sale.create` / `sale.late_entry` open no one else's sale (API Part 4 v1.3 — WA1).
   */
  @Get('sales/:id')
  @Can('sale.view', { branch: SALE_BRANCH, orSelf: 'sale.readers' })
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
