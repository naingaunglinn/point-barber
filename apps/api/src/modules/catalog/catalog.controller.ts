import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  type CursorPage,
  ErrorCode,
  type QuoteDto,
  type QuoteRequest,
  type ServiceCategoryDto,
  type ServiceListItemDto,
  type ServicesQuery,
  quoteRequestSchema,
  servicesQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../common/access/access-context.js';
import { Staff } from '../../common/access/declarations.js';
import { inReadScope, toReadScope } from '../../common/access/read-scope.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ProblemException } from '../../common/http/problem.exception.js';
import { ZBody, ZQuery } from '../../common/http/zod-validation.pipe.js';
import { PriceQuote, toQuoteDto } from './price-quote/price-quote.js';
import { ServiceCatalog } from './service-list/service-catalog.js';

// The operational reads of the POS (P2.CAT.01 · P2.SVC.01 · P2.PRC.06 · API-PERM-03 ·
// add-walkin-visit-checkout design D2): any signed-in staff member, limited to the read scope; no code.
@Controller('v1')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ServiceCatalog,
    private readonly quotes: PriceQuote,
  ) {}

  /** P2.SVC.01 — the services sold at a branch; a branch outside the read scope is an empty page. */
  @Get('services')
  @Staff()
  services(
    @ZQuery(servicesQuerySchema) query: ServicesQuery,
  ): Promise<CursorPage<ServiceListItemDto>> {
    return this.catalog.listServices(this.prisma, query, toReadScope(AccessContext.scope()));
  }

  /** P2.CAT.01 — the ACTIVE categories in `sort_order`. */
  @Get('service-categories')
  @Staff()
  categories(): Promise<{ items: ServiceCategoryDto[] }> {
    return this.catalog.listCategories(this.prisma);
  }

  /** P2.PRC.06 — the one price calculator; a pure read sent as POST because of its body. */
  @Post('prices/quote')
  @HttpCode(200)
  @Staff()
  async quote(@ZBody(quoteRequestSchema) body: QuoteRequest): Promise<QuoteDto> {
    if (!inReadScope(toReadScope(AccessContext.scope()), body.branch_id))
      throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    await this.quotes.assertQuotable(this.prisma, body.branch_id, body.date);
    return toQuoteDto(await this.quotes.quote(this.prisma, body));
  }
}
