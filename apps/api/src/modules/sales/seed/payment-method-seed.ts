import { Injectable } from '@nestjs/common';
import { PaymentMethodKind } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import { PaymentMethodsRepository } from '../repositories/payment-methods.repository.js';

// The two system payment methods of the base seed (Part 4 §8 · P4-RULE-19 · D-PAY-01 / 02 · design D3),
// every environment: CASH and KBZPAY are inserted when the company has no row with that code; an
// existing row — renamed, its KBZPay pattern set by the owner — is never changed. KBZPay's pattern
// stays NULL until the pilot data script or the payment-methods screen sets it.
const SYSTEM_METHODS = [
  {
    code: 'CASH',
    name_mm: 'ငွေသား',
    name_en: 'Cash',
    kind: PaymentMethodKind.CASH,
    is_cash: true,
    requires_reference: false,
    requires_verification: false,
    sort_order: 1,
  },
  {
    code: 'KBZPAY',
    name_mm: 'KBZPay',
    name_en: 'KBZPay',
    kind: PaymentMethodKind.MOBILE_WALLET,
    is_cash: false,
    requires_reference: true,
    requires_verification: true,
    sort_order: 2,
  },
] as const;

@Injectable()
export class PaymentMethodSeed {
  constructor(
    private readonly repository: PaymentMethodsRepository,
    private readonly company: CurrentCompany,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /** Inserts CASH and KBZPAY where missing; one `payment_method.create` system row each. */
  async ensure(tx: Tx): Promise<void> {
    const companyId = await this.company.id(tx);
    const existing = await this.repository.codes(tx, companyId);
    const now = this.clock.now();
    for (const method of SYSTEM_METHODS) {
      if (existing.has(method.code)) continue;
      const row = {
        id: uuidV7(now.getTime()),
        company_id: companyId,
        ...method,
        reference_regex: null,
      };
      await this.repository.insert(tx, row, now);
      this.audit.emitSystem({
        action: 'payment_method.create',
        entity_type: 'payment_methods',
        entity_id: row.id,
        after: { ...method, reference_regex: null },
      });
    }
  }
}
