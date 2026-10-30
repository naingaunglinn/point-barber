import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// A branch's printed header and its company (Part 1 — the people module owns companies and branches):
// both languages, the caller picks (AD-RCPT-01 item 1).
export interface BranchHeaderRow {
  readonly company_id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly address_mm: string | null;
  readonly address_en: string | null;
  readonly phone: string | null;
  readonly companies: { readonly name_mm: string; readonly name_en: string | null };
}

@Injectable()
export class BranchHeaderRepository {
  headerOf(db: Tx, branchId: string): Promise<BranchHeaderRow | null> {
    return db.branches.findUnique({
      where: { id: branchId },
      select: {
        company_id: true,
        name_mm: true,
        name_en: true,
        address_mm: true,
        address_en: true,
        phone: true,
        companies: { select: { name_mm: true, name_en: true } },
      },
    });
  }
}
