import { Injectable } from '@nestjs/common';
import {
  type CursorPage,
  type CustomerDto,
  type CustomerListItemDto,
  type CustomerListQuery,
  type CustomerLookupDto,
  CustomerStatus,
  type CustomerTimelineQuery,
  type E164,
  ErrorCode,
  type Mmk,
  type SaleStatus,
  type VisitStatus,
  maskPhone,
  normalizeDigits,
  normalizePhone,
  parseCustomerQuery,
  type TimelineEntryDto,
  toMmtIso,
  toMmtIsoMillis,
} from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import type { SqlPiece, Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import {
  type CustomerListRow,
  type CustomerRow,
  CustomersRepository,
} from '../repositories/customers.repository.js';
import { decodeListCursor, decodeTimelineCursor, encodeListCursor } from './customer-cursors.js';
import { CustomerStats } from './customer-stats.js';
import { CustomerTimeline } from './customer-timeline.js';
import type { RecentVisit } from './preferred-barber.js';

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

/** A customer's figures in a read scope (P3-RULE-03 · add-customer-management design D6). */
export interface CustomerTotals {
  /** FINISHED sales of the customer that have a visit. */
  readonly visit_count: number;
  /** Σ total of the FINISHED sales (with or without a visit) − Σ their kind-1 refunds. */
  readonly total_spent_amount: Mmk;
  readonly last_visit_at: Date | null;
}

/**
 * The customer's Part 4 history in a read scope — `last_visit_at` of P3.CUS.02, and the list, the
 * statistics and the timeline of add-customer-management (design D1 / D3 / D6). Declared here,
 * implemented by `sales`, which owns the finished sales (walk-in design D1).
 */
export interface CustomerActivity {
  lastVisitAt(db: Tx, customerId: string, branchIds: ReadScope): Promise<Date | null>;
  /** `customer_id, last_visit_at, visit_count` per customer — the list joins and sorts on it (D3). */
  visitAggregate(scope: ReadScope): SqlPiece;
  totals(db: Tx, customerId: string, scope: ReadScope): Promise<CustomerTotals>;
  /** The last `window` FINISHED visits, newest first, with their performers (D6). */
  recentVisits(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    window: number,
  ): Promise<readonly RecentVisit[]>;
  /**
   * The visits of the customer's sales and the FINISHED visit-less sales strictly older than `before`
   * (`(at, id)`), newest first, at most `take` — cut in SQL (design D10 · R6 · CG-PERF-02).
   */
  timelineEntries(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    before: { readonly at: Date; readonly id: string } | null,
    take: number,
  ): Promise<readonly ActivityEntry[]>;
}

/** A timeline entry of `sales`: a visit at `started_at`, a visit-less FINISHED sale at `finished_at`. */
export type ActivityEntry =
  | {
      readonly type: 'visit';
      readonly id: string;
      readonly at: Date;
      readonly branch_id: string;
      readonly status: VisitStatus;
      readonly employee_id: string;
      /** Set only once the sale is FINISHED. */
      readonly receipt_number: string | null;
      readonly total_amount: Mmk | null;
    }
  | {
      readonly type: 'sale';
      readonly id: string;
      readonly at: Date;
      readonly branch_id: string;
      readonly status: SaleStatus;
      readonly receipt_number: string;
      readonly total_amount: Mmk;
    };

const notFound = (): ProblemException => new ProblemException(ErrorCode.NOT_FOUND, 404);

/** `CustomerListItem` — the counts are the caller's read scope's (P3.CUS.01 · P3-RULE-03). */
const toListItem = (row: CustomerListRow): CustomerListItemDto => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  phone_normalized: row.phone_normalized,
  status: row.status,
  archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
  last_visit_at: row.last_visit_at === null ? null : toMmtIso(row.last_visit_at),
  visit_count: row.visit_count,
});

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
    private readonly stats: CustomerStats,
    private readonly timelines: CustomerTimeline,
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
    const lastVisit = await this.port().lastVisitAt(db, row.id, scope);
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

  /**
   * P3.CUS.01 — the company's customers by status (default ACTIVE), archived ones on request, `q`
   * by name or phone (owner CM1); sorted, keyset-paged, `total` of the filter (design D3).
   */
  async list(
    db: Tx,
    query: CustomerListQuery,
    scope: ReadScope,
  ): Promise<CursorPage<CustomerListItemDto>> {
    const filter = {
      companyId: await this.company.id(db),
      status: query.status,
      includeArchived: query.include_archived,
      query: parseCustomerQuery(query.q),
    };
    const after = query.cursor === undefined ? null : decodeListCursor(query.cursor, query.sort);
    const visits = this.port().visitAggregate(scope);
    const rows = await this.repository.listPage(db, filter, query.sort, after, query.limit, visits);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const key =
      query.sort === 'name'
        ? null
        : query.sort === '-created_at'
          ? last?.created_key
          : last?.visit_key;
    return {
      items: items.map(toListItem),
      next_cursor:
        rows.length > query.limit && last !== undefined
          ? encodeListCursor({ sort: query.sort, key, name: last.name, id: last.id })
          : null,
      total: await this.repository.listTotal(db, filter),
    };
  }

  /** P3.CUS.04 — any customer of the company, archived ones included; statistics in the scope. */
  async detail(db: Tx, id: string, scope: ReadScope): Promise<CustomerDto> {
    const row = await this.customerOf(db, id);
    const { stats, upcoming } = await this.stats.of(db, this.port(), id, scope, this.clock.now());
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      phone_normalized: row.phone_normalized,
      status: row.status as CustomerDto['status'],
      archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
      last_visit_at: stats.last_visit_at,
      visit_count: stats.visit_count,
      notes: row.notes,
      stats,
      upcoming_bookings: upcoming,
      created_at: toMmtIso(row.created_at),
      // The edit stamp carries milliseconds (design D8 · API-IDEM-04).
      updated_at: toMmtIsoMillis(row.updated_at),
    };
  }

  /** P3.CUS.09 — bookings, visits and visit-less sales in the scope, newest first (design D10). */
  async timeline(
    db: Tx,
    id: string,
    query: CustomerTimelineQuery,
    scope: ReadScope,
  ): Promise<CursorPage<TimelineEntryDto>> {
    await this.customerOf(db, id);
    const before = query.cursor === undefined ? null : decodeTimelineCursor(query.cursor);
    return this.timelines.page(db, this.port(), id, scope, before, query.limit);
  }

  /** The company's customer of `id`; 404 for an id that is no uuid or names no customer. */
  private async customerOf(db: Tx, id: string) {
    if (!isUuid(id)) throw notFound();
    const row = await this.repository.byId(db, await this.company.id(db), id);
    if (row === null) throw notFound();
    return row;
  }

  private port(): CustomerActivity {
    if (this.activity === undefined) {
      throw new Error('Customers: no CustomerActivity registered (SalesModule not loaded)');
    }
    return this.activity;
  }
}
