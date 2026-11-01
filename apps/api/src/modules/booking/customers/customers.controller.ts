import { Controller, Get } from '@nestjs/common';
import {
  type CustomerLookupDto,
  type CustomerLookupQuery,
  customerLookupQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Customers } from './customers.js';

// P3.CUS.02 — the phone lookup of the Finish step (AD-FORM-10 · add-walkin-visit-checkout design D2):
// an operational read for every staff member; `last_visit_at` counts only the read scope's branches.
@Controller('v1/customers')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: Customers,
  ) {}

  @Get('lookup')
  @Staff()
  lookup(
    @ZQuery(customerLookupQuerySchema) query: CustomerLookupQuery,
  ): Promise<{ customer: CustomerLookupDto | null; archived?: true }> {
    return this.customers.lookup(this.prisma, query.phone, toReadScope(AccessContext.scope()));
  }
}
