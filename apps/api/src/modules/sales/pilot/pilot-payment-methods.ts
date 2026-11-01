import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import {
  PilotRefused,
  type PilotRunContext,
  changedValue,
} from '../../../common/pilot/pilot-run.js';
import { Audit } from '../../platform/index.js';

// The `sales` surface of the pilot data seed (add-pilot-data-seed design D3 / D4.3 · P4-RULE-19 ·
// D-PAY-02): the system payment methods the walk-in base seed creates must exist, and the KBZPay
// reference pattern of the file is written to KBZPAY — only while it is NULL (PD3 ★). Deleted with
// the command (design D10).

@Injectable()
export class PilotPaymentMethods {
  constructor(private readonly audit: Audit) {}

  /** D4.3: CASH and KBZPAY exist — the API has started on a build with the walk-in slice. */
  async refuseWithoutSystemRows(tx: Tx): Promise<void> {
    const rows = await tx.payment_methods.findMany({
      where: { code: { in: ['CASH', 'KBZPAY'] } },
      select: { code: true },
    });
    const missing = ['CASH', 'KBZPAY'].filter((code) => !rows.some((row) => row.code === code));
    if (missing.length > 0) {
      throw new PilotRefused([
        `payment_methods: no ${missing.join(', ')} — start the API once on a build with add-walkin-visit-checkout first (base seed)`,
      ]);
    }
  }

  /** NULL → set; equal → unchanged; another stored pattern → refused (PD3 ★). */
  async setReferenceRegex(
    tx: Tx,
    code: 'KBZPAY',
    regex: string,
    ctx: PilotRunContext,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string; reference_regex: string | null }[]>`
      SELECT id, reference_regex FROM payment_methods WHERE code = ${code} FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) throw new PilotRefused([`payment_methods: no ${code}`]);
    if (row.reference_regex === regex) {
      ctx.plan.unchanged('payment_methods');
      return;
    }
    if (row.reference_regex !== null) {
      throw new PilotRefused([
        changedValue('payment_methods', code, 'reference_regex', row.reference_regex, regex),
      ]);
    }
    await tx.payment_methods.update({
      where: { id: row.id },
      data: { reference_regex: regex, updated_at: ctx.now },
    });
    ctx.plan.updated('payment_methods');
    // Company master: no branch (P4-RULE-20).
    this.audit.emitSystem({
      action: 'payment_method.update',
      entity_type: 'payment_methods',
      entity_id: row.id,
      branch_id: null,
      before: { reference_regex: null },
      after: { reference_regex: regex, operator: ctx.operator },
    });
  }
}
