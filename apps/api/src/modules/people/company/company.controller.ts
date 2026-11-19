import { Controller, Get, Patch } from '@nestjs/common';
import { type CompanyDto, type CompanyUpdate, companyUpdateSchema } from '@point/shared';

import { Can, Staff } from '../../../common/access/declarations.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { COMPANY_UPDATE, CompanyProfile } from './company-profile.js';

// The company profile endpoints (P1.CO.01 / P1.CO.02 · add-company-profile design D2): one access
// declaration each; the service does the work (CG-API-01).
@Controller('v1')
export class CompanyController {
  constructor(private readonly profile: CompanyProfile) {}

  /** P1.CO.01 — reference data for every signed-in staff member; `company.view` only gates the menu. */
  @Get('company')
  @Staff()
  read(): Promise<CompanyDto> {
    return this.profile.read();
  }

  /** P1.CO.02 — company master (P1-RULE-13): `company.update` through a company-scope assignment. */
  @Patch('company')
  @Can('company.update', { level: 'company' })
  @Audited({ actions: [COMPANY_UPDATE] })
  update(@ZBody(companyUpdateSchema) body: CompanyUpdate): Promise<CompanyDto> {
    return this.profile.update(body);
  }
}
