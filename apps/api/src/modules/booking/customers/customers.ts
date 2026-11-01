import { Injectable } from '@nestjs/common';
import {
  type CustomerLookupDto,
  CustomerStatus,
  type E164,
  ErrorCode,
  maskPhone,
  normalizeDigits,
  normalizePhone,
  toMmtIso,
} from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import { type CustomerRow, CustomersRepository } from '../repositories/customers.repository.js';

// One customer identity function (P3-RULE-01 · D-CUS-02 / 03 · add-walkin-visit-checkout design D1):
// the only way a FINISH (and later a booking) finds its customer. `INSERT … ON CONFLICT DO NOTHING` +
// `SELECT … FOR UPDATE`, so two first-time sales for one phone never create two rows. The stored name
// is never overwritten; INACTIVE → ACTIVE, archived → restored, each with a warning and an audit row.
// No permission code is needed (D-CUS-03 "auto").

/** The audit actions of the customer identity function; an endpoint that calls it lists them in @Audited. */
export const CUSTOMER_CREATE = 'customer.create';
export const CUSTOMER_RESTORE = 'customer.restore';
export const CUSTOMER_REACTIVATE = 'customer.reactivate';

export interface CustomerRef {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly phone_normalized: string;
  readonly status: number;
}

export interface MatchResult {
  readonly customer: CustomerRef;
  readonly warnings: readonly { readonly code: 'customer_restored' | 'customer_reactivated' }[];
}

/**
 * The last finished visit of a customer at the branches in scope (P3.CUS.02 `last_visit_at`).
 * Declared here, implemented by `sales`, which owns the finished sales (design D1).
 */
export interface CustomerActivity {
  lastVisitAt(db: Tx, customerId: string, branchIds: ReadScope): Promise<Date | null>;
}

const ref = (row: CustomerRow): CustomerRef => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  phone_normalized: row.phone_normalized,
  status: row.status,
});

@Injectable()
export class Customers {
  private activity: CustomerActivity | undefined;

  constructor(
    private readonly repository: CustomersRepository,
    private readonly company: CurrentCompany,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /** Called once by the sales module at start-up; booking never imports sales. */
  useActivity(activity: CustomerActivity): void {
    this.activity = activity;
  }

  async matchOrCreate(
    tx: Tx,
    input: {
      readonly phone: string;
      readonly name?: string | null;
      readonly actor_user_id: string;
    },
  ): Promise<MatchResult> {
    const normalized = normalizePhone(input.phone);
    if (normalized === 'phone_invalid') throw new ProblemException(ErrorCode.PHONE_INVALID, 400);
    const companyId = await this.company.id(tx);
    const now = this.clock.now();
    const name = input.name?.trim() ?? '';
    const id = uuidV7(now.getTime());
    const created =
      name !== '' &&
      (await this.repository.insertIfNew(tx, {
        id,
        company_id: companyId,
        name,
        // Stored as typed, but with Western digits (AD-FMT-10): `၀၉ ၇၇၁၂ ၃၄၅၆` → `09 7712 3456`.
        phone: normalizeDigits(input.phone).trim(),
        phone_normalized: normalized,
        at: now,
      }));
    const row = await this.repository.lockByPhone(tx, companyId, normalized);
    if (row === null) {
      // An unknown phone needs the typed name (customers.name NOT NULL — Part 4 §10.6 #11).
      throw new ProblemException(ErrorCode.VALIDATION, 400, {
        errors: [{ field: 'customer.name', code: 'invalid_type', params: { expected: 'string' } }],
      });
    }
    if (created) {
      await this.audit.emit({
        action: CUSTOMER_CREATE,
        entity_type: 'customers',
        entity_id: row.id,
        after: { name: row.name, phone_normalized: row.phone_normalized },
        actor_user_id: input.actor_user_id,
      });
      return { customer: ref(row), warnings: [] };
    }
    if (row.archived_at !== null) {
      await this.repository.reactivate(tx, row.id, now);
      await this.audit.emit({
        action: CUSTOMER_RESTORE,
        entity_type: 'customers',
        entity_id: row.id,
        before: { status: row.status, archived: true },
        after: { status: CustomerStatus.ACTIVE, archived: false },
        actor_user_id: input.actor_user_id,
      });
      return {
        customer: { ...ref(row), status: CustomerStatus.ACTIVE },
        warnings: [{ code: 'customer_restored' }],
      };
    }
    if (row.status !== CustomerStatus.ACTIVE) {
      await this.repository.reactivate(tx, row.id, now);
      await this.audit.emit({
        action: CUSTOMER_REACTIVATE,
        entity_type: 'customers',
        entity_id: row.id,
        before: { status: row.status },
        after: { status: CustomerStatus.ACTIVE },
        actor_user_id: input.actor_user_id,
      });
      return {
        customer: { ...ref(row), status: CustomerStatus.ACTIVE },
        warnings: [{ code: 'customer_reactivated' }],
      };
    }
    return { customer: ref(row), warnings: [] };
  }

  /** `{ id, name, phone }` of customers (the Sale DTO's `customer`), keyed by id. */
  async summaries(
    db: Tx,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, { id: string; name: string; phone: string }>> {
    const rows = await this.repository.summaries(db, [...new Set(ids)]);
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** The customer as a receipt prints them (AD-RCPT-01 item 4): the name and the masked phone only. */
  async forReceipt(
    db: Tx,
    id: string,
  ): Promise<{ name: string; phone_masked: string | null } | null> {
    const row = await this.repository.nameAndPhone(db, id);
    return row === null
      ? null
      : { name: row.name, phone_masked: maskPhone(row.phone_normalized as E164) };
  }

  /**
   * P3.CUS.02 — an exact match of the normalised phone, inactive customers included; an archived one
   * is `{ customer: null, archived: true }`. `last_visit_at` counts only branches in the read scope.
   */
  async lookup(
    db: Tx,
    phone: string,
    scope: ReadScope,
  ): Promise<{ customer: CustomerLookupDto | null; archived?: true }> {
    const normalized = normalizePhone(phone);
    if (normalized === 'phone_invalid') throw new ProblemException(ErrorCode.PHONE_INVALID, 400);
    const row = await this.repository.findByPhone(db, await this.company.id(db), normalized);
    if (row === null) return { customer: null };
    if (row.archived_at !== null) return { customer: null, archived: true };
    if (this.activity === undefined) {
      throw new Error('Customers: no CustomerActivity registered (SalesModule not loaded)');
    }
    const lastVisit = await this.activity.lastVisitAt(db, row.id, scope);
    return {
      customer: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        status: row.status as CustomerLookupDto['status'],
        notes: row.notes,
        last_visit_at: lastVisit === null ? null : toMmtIso(lastVisit),
        upcoming_bookings: [],
      },
    };
  }
}
