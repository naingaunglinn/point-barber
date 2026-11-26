import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type CursorPage,
  ErrorCode,
  type QuoteDto,
  type QuoteRequest,
  type ServiceCategoriesQuery,
  type ServiceCategoryDto,
  type ServiceDto,
  type ServiceListItemDto,
  type ServicesQuery,
  quoteRequestSchema,
  serviceCategoriesQuerySchema,
  servicesQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../common/access/access-context.js';
import { Staff } from '../../common/access/declarations.js';
import { inReadScope, toReadScope } from '../../common/access/read-scope.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ProblemException } from '../../common/http/problem.exception.js';
import { ZBody, ZQuery } from '../../common/http/zod-validation.pipe.js';
import { PriceQuote, toQuoteDto } from './price-quote/price-quote.js';
import { ServiceDetail } from './service-detail/service-detail.js';
import { ServiceCatalog } from './service-list/service-catalog.js';

// The operational reads of the POS (P2.CAT.01 · P2.SVC.01 · P2.PRC.06 · API-PERM-03 ·
// add-walkin-visit-checkout design D2): any signed-in staff member, limited to the read scope; no code.
@Controller('v1')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ServiceCatalog,
    private readonly detail: ServiceDetail,
    private readonly quotes: PriceQuote,
  ) {}

  /**
   * P2.SVC.01 — the services sold at a branch; a branch outside the read scope is an empty page.
   * `include_archived=true` and `sold=all` are management reads: they need `service.view⁺` (add-service-
   * catalogue design D2 / D5 · P2-RULE-11), checked before any read.
   */
  @Get('services')
  @Staff()
  services(
    @ZQuery(servicesQuerySchema) query: ServicesQuery,
  ): Promise<CursorPage<ServiceListItemDto>> {
    const management =
      query.include_archived || query.sold === 'all'
        ? AccessContext.requireViewScope('service')
        : undefined;
    return this.catalog.listServices(
      this.prisma,
      query,
      toReadScope(AccessContext.scope()),
      management === undefined ? undefined : toReadScope(management),
    );
  }

  /** P2.SVC.03 — any signed-in staff member; an archived service only for `service.view⁺`, else 404. */
  @Get('services/:id')
  @Staff()
  service(@Param('id') id: string): Promise<ServiceDto> {
    return this.detail.get(this.prisma, id, {
      scope: toReadScope(AccessContext.scope()),
      management: AccessContext.viewScope('service') !== null,
    });
  }

  /** P2.CAT.01 — the ACTIVE categories in catalogue order; `include_archived=true` is a management read. */
  @Get('service-categories')
  @Staff()
  categories(
    @ZQuery(serviceCategoriesQuerySchema) query: ServiceCategoriesQuery,
  ): Promise<{ items: ServiceCategoryDto[] }> {
    if (query.include_archived) AccessContext.requireViewScope('service');
    return this.catalog.listCategories(this.prisma, query);
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
