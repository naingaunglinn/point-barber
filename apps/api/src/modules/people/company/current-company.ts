import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { CompanyRepository } from '../repositories/company.repository.js';

// One place decides the company (D-ORG-03 #5): the system serves one company, created by the base
// seed. Code never assumes a company id of its own.
@Injectable()
export class CurrentCompany {
  constructor(private readonly repository: CompanyRepository) {}

  async id(tx?: Tx): Promise<string> {
    const id = await this.repository.companyId(tx);
    if (id === null)
      throw new Error('no company row yet — the base seed runs at the first API start');
    return id;
  }
}
