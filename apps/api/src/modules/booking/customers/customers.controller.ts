import { Controller, Get, Param } from '@nestjs/common';
import {
  type CursorPage,
  type CustomerDto,
  type CustomerListItemDto,
  type CustomerListQuery,
  type CustomerLookupDto,
  type CustomerLookupQuery,
  type CustomerTimelineQuery,
  type TimelineEntryDto,
  customerListQuerySchema,
  customerLookupQuerySchema,
  customerTimelineQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { CanView, Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Customers } from './customers.js';

// P3.CUS.02 — the phone lookup of the Finish step (AD-FORM-10 · add-walkin-visit-checkout design D2):
// an operational read for every staff member; `last_visit_at` counts only the read scope's branches.
// add-customer-management — the three management reads P3.CUS.01 / 04 / 09 (design D2): any code of
// `customer` through any active assignment reads every customer of the company (level `shared` —
// ADR-012); the history in them is the caller's read scope's. `lookup` is declared before `:id`.
@Controller('v1/customers')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: Customers,
  ) {}

  @Get()
  @CanView('customer', { level: 'shared' })
  list(
    @ZQuery(customerListQuerySchema) query: CustomerListQuery,
  ): Promise<CursorPage<CustomerListItemDto>> {
    return this.customers.list(this.prisma, query, toReadScope(AccessContext.scope()));
  }

  @Get('lookup')
  @Staff()
  lookup(
    @ZQuery(customerLookupQuerySchema) query: CustomerLookupQuery,
  ): Promise<{ customer: CustomerLookupDto | null; archived?: true }> {
    return this.customers.lookup(this.prisma, query.phone, toReadScope(AccessContext.scope()));
  }

  @Get(':id')
  @CanView('customer', { level: 'shared' })
  detail(@Param('id') id: string): Promise<CustomerDto> {
    return this.customers.detail(this.prisma, id, toReadScope(AccessContext.scope()));
  }

  @Get(':id/timeline')
  @CanView('customer', { level: 'shared' })
  timeline(
    @Param('id') id: string,
    @ZQuery(customerTimelineQuerySchema) query: CustomerTimelineQuery,
  ): Promise<CursorPage<TimelineEntryDto>> {
    return this.customers.timeline(this.prisma, id, query, toReadScope(AccessContext.scope()));
  }
}
