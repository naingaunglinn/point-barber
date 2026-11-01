import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { BranchHeaderRepository } from '../repositories/branch-header.repository.js';

// What a receipt prints about its branch and company (AD-RCPT-01 item 1 · OPEN-32): the English text,
// else the Myanmar one (AD-L10N-03), read as the data is now — a stored receipt file keeps its own.
export interface BranchHeader {
  readonly company_id: string;
  readonly company_name: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
}

const present = (text: string | null): text is string => text !== null && text.trim() !== '';
const english = (en: string | null, mm: string): string => (present(en) ? en : mm);
const englishOrNull = (en: string | null, mm: string | null): string | null =>
  present(en) ? en : present(mm) ? mm : null;

@Injectable()
export class BranchHeaders {
  constructor(private readonly repository: BranchHeaderRepository) {}

  async englishOf(db: Tx, branchId: string): Promise<BranchHeader> {
    const row = await this.repository.headerOf(db, branchId);
    if (row === null) throw new Error(`branch ${branchId} does not exist`);
    return {
      company_id: row.company_id,
      company_name: english(row.companies.name_en, row.companies.name_mm),
      name: english(row.name_en, row.name_mm),
      address: englishOrNull(row.address_en, row.address_mm),
      phone: present(row.phone) ? row.phone : null,
    };
  }
}
