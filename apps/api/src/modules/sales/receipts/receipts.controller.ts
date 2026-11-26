import { Controller, Get } from '@nestjs/common';
import {
  type ReceiptListPageDto,
  type ReceiptListQuery,
  type ReceiptLookupDto,
  type ReceiptLookupQuery,
  receiptListQuerySchema,
  receiptLookupQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { ReceiptList } from './receipt-list.js';
import { ReceiptLookup } from './receipt-lookup.js';

// P4.RCP.04 / P4.RCP.03 — "print for a colleague" (D-PAY-07 · AD-POS-13 · P4-RULE-18 / 20): operational
// reads open to every signed-in staff member without a code; the read scope filters the list and hides a
// number outside it (API-PERM-03).
@Controller('v1')
export class ReceiptsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly list: ReceiptList,
    private readonly lookup: ReceiptLookup,
  ) {}

  /** P4.RCP.04 — the branch's receipts of a day, newest first, no amounts. */
  @Get('receipts')
  @Staff()
  receipts(@ZQuery(receiptListQuerySchema) query: ReceiptListQuery): Promise<ReceiptListPageDto> {
    return this.list.page(this.prisma, toReadScope(AccessContext.scope()), query);
  }

  /** P4.RCP.03 — one receipt by its exact number; 404 when none or outside the read scope. */
  @Get('receipts/lookup')
  @Staff()
  find(@ZQuery(receiptLookupQuerySchema) query: ReceiptLookupQuery): Promise<ReceiptLookupDto> {
    return this.lookup.find(this.prisma, toReadScope(AccessContext.scope()), query.number);
  }
}
