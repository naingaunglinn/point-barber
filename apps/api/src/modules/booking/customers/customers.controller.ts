import { Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type CursorPage,
  type CustomerArchiveBody,
  type CustomerCreateBody,
  type CustomerDto,
  type CustomerListItemDto,
  type CustomerListQuery,
  type CustomerLookupDto,
  type CustomerLookupQuery,
  type CustomerStatusBody,
  type CustomerTimelineQuery,
  type CustomerUpdateBody,
  type TimelineEntryDto,
  customerArchiveSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerLookupQuerySchema,
  customerStatusSchema,
  customerTimelineQuerySchema,
  customerUpdateSchema,
} from '@point/shared';
import type { Response } from 'express';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, CanView, Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import {
  CUSTOMER_ARCHIVE,
  CUSTOMER_CREATE,
  CUSTOMER_DEACTIVATE,
  CUSTOMER_REACTIVATE,
  CUSTOMER_RESTORE,
  CUSTOMER_UPDATE,
  Customers,
} from './customers.js';

// P3.CUS.02 — the phone lookup of the Finish step (AD-FORM-10 · add-walkin-visit-checkout design D2):
// an operational read for every staff member; `last_visit_at` counts only the read scope's branches.
// add-customer-management — the three management reads P3.CUS.01 / 04 / 09 (design D2): any code of
// `customer` through any active assignment reads every customer of the company (level `shared` —
// ADR-012); the history in them is the caller's read scope's. `lookup` is declared before `:id`. The
// five writes P3.CUS.03 / 05 / 06 / 07 / 08 each hold one code of `customer` at the `shared` level,
// with the audit actions they may write (design D2).
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

  /** P3.CUS.03 — `customer.create`; 201 with `Location` (API-DATA-10). */
  @Post()
  @Can('customer.create', { level: 'shared' })
  @Audited({ actions: [CUSTOMER_CREATE] })
  async create(
    @ZBody(customerCreateSchema) body: CustomerCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CustomerDto> {
    const customer = await this.customers.create(body, toReadScope(AccessContext.scope()));
    res.location(`/api/v1/customers/${customer.id}`);
    return customer;
  }

  /** P3.CUS.05 — `customer.update`; the members sent plus `expected_updated_at`. */
  @Patch(':id')
  @Can('customer.update', { level: 'shared' })
  @Audited({ actions: [CUSTOMER_UPDATE] })
  update(
    @Param('id') id: string,
    @ZBody(customerUpdateSchema) body: CustomerUpdateBody,
  ): Promise<CustomerDto> {
    return this.customers.update(id, body, toReadScope(AccessContext.scope()));
  }

  /** P3.CUS.06 — `customer.delete`: Inactive or Active. */
  @Post(':id/status')
  @HttpCode(200)
  @Can('customer.delete', { level: 'shared' })
  @Audited({ actions: [CUSTOMER_DEACTIVATE, CUSTOMER_REACTIVATE] })
  setStatus(
    @Param('id') id: string,
    @ZBody(customerStatusSchema) body: CustomerStatusBody,
  ): Promise<CustomerDto> {
    return this.customers.setStatus(id, body, toReadScope(AccessContext.scope()));
  }

  /** P3.CUS.07 — `customer.delete`: hides the customer, keeps the row. */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('customer.delete', { level: 'shared' })
  @Audited({ actions: [CUSTOMER_ARCHIVE] })
  archive(
    @Param('id') id: string,
    @ZBody(customerArchiveSchema) body: CustomerArchiveBody,
  ): Promise<CustomerDto> {
    return this.customers.archive(id, body, toReadScope(AccessContext.scope()));
  }

  /** P3.CUS.08 — `customer.delete`: an archived customer back as ACTIVE. */
  @Post(':id/restore')
  @HttpCode(200)
  @Can('customer.delete', { level: 'shared' })
  @Audited({ actions: [CUSTOMER_RESTORE] })
  restore(@Param('id') id: string): Promise<CustomerDto> {
    return this.customers.restore(id, toReadScope(AccessContext.scope()));
  }
}
