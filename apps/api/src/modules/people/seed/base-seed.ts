import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { CatalogueRepository } from '../repositories/catalogue.repository.js';
import { CompanyRepository } from '../repositories/company.repository.js';
import { SeedRoles } from '../roles/seed-roles.js';

// The base seed of Part 1 (fixtures §9 · D-ORG-03 · D-ROLE-09 · design D10): every environment, at
// every start, after the catalogue sync — the one company row (from COMPANY_NAME_MM / _EN, when the
// table is empty) and the three seed roles. Idempotent: a second run changes nothing. Under the
// code-tables lock, like the sync and the first-admin command.
@Injectable()
export class BaseSeed {
  constructor(
    private readonly catalogue: CatalogueRepository,
    private readonly companies: CompanyRepository,
    private readonly seedRoles: SeedRoles,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async run(tx: Tx): Promise<void> {
    await this.catalogue.lockCodeTables(tx);
    let companyId = await this.companies.companyId(tx);
    if (companyId === null) {
      const now = this.clock.now();
      companyId = uuidV7(now.getTime());
      await this.companies.createCompany(
        tx,
        {
          id: companyId,
          name_mm: this.config.env.COMPANY_NAME_MM,
          name_en: this.config.env.COMPANY_NAME_EN ?? null,
        },
        now,
      );
    }
    await this.seedRoles.ensure(tx, companyId);
  }
}
