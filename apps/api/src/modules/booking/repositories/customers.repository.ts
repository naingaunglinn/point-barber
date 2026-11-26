import { Injectable } from '@nestjs/common';
import { type CustomerQuery, type CustomerSort, CustomerStatus, codeOf } from '@point/shared';
import { z } from 'zod';

import { Prisma } from '../../../generated/prisma/client.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { ListCursor } from '../customers/customer-cursors.js';

// The customers table (Part 3 — the booking module owns it). Customers are company-level and
// identified by `phone_normalized` (unique per company, archived rows included — F-BK-21).

export interface CustomerRow {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly phone_normalized: string;
  readonly notes: string | null;
  readonly status: number;
  readonly archived_at: Date | null;
}

/** A customer row locked FOR UPDATE for a write: the members of the detail (design D5 · D8). */
export interface LockedCustomerRow extends CustomerRow {
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** The list's filter (P3.CUS.01 · design D3): company, status, archived rows, the `q` reader. */
export interface CustomerListFilter {
  readonly companyId: string;
  readonly status: readonly CustomerStatus[];
  readonly includeArchived: boolean;
  readonly query: CustomerQuery | null;
}

const listRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  phone_normalized: z.string(),
  status: codeOf(CustomerStatus),
  archived_at: z.date().nullable(),
  last_visit_at: z.date().nullable(),
  visit_count: z.number().int(),
  /** The sort keys as PostgreSQL prints them, for the next cursor. */
  created_key: z.string(),
  visit_key: z.string().nullable(),
});
export type CustomerListRow = z.infer<typeof listRowSchema>;

/** Names in the Myanmar ICU collation (proposal reading 9 · R4). */
const NAME = Prisma.raw('c.name COLLATE "my-x-icu"');

const ORDER: Readonly<Record<CustomerSort, Prisma.Sql>> = {
  '-last_visit_at': Prisma.sql`v.last_visit_at DESC NULLS LAST, ${NAME}, c.id`,
  name: Prisma.sql`${NAME}, c.id`,
  '-created_at': Prisma.sql`c.created_at DESC, ${NAME}, c.id`,
};

function filterOf(filter: CustomerListFilter): Prisma.Sql {
  const { query } = filter;
  const match =
    query === null
      ? Prisma.empty
      : query.kind === 'phone'
        ? Prisma.sql`AND (${Prisma.join(
            query.digits.map((digits) => Prisma.sql`c.phone_normalized LIKE ${`%${digits}%`}`),
            ' OR ',
          )})`
        : Prisma.sql`AND c.name ILIKE ${`%${query.pattern}%`}`;
  return Prisma.sql`
    WHERE c.company_id = ${filter.companyId}::uuid AND c.status = ANY(${[...filter.status]}::smallint[])
      ${filter.includeArchived ? Prisma.empty : Prisma.sql`AND c.archived_at IS NULL`} ${match}`;
}

/** The rows after the cursor in the sort's order, NULLS LAST spelled out (design D3). */
function afterOf(sort: CustomerSort, cursor: ListCursor | null): Prisma.Sql {
  if (cursor === null) return Prisma.empty;
  const byName = Prisma.sql`(${NAME} > ${cursor.name}::text COLLATE "my-x-icu"
    OR (c.name = ${cursor.name} AND c.id > ${cursor.id}::uuid))`;
  const key = cursor.key ?? null;
  if (sort === 'name') return Prisma.sql`AND ${byName}`;
  if (sort === '-created_at') {
    return Prisma.sql`AND (c.created_at < ${key}::timestamptz
      OR (c.created_at = ${key}::timestamptz AND ${byName}))`;
  }
  return key === null
    ? Prisma.sql`AND v.last_visit_at IS NULL AND ${byName}`
    : Prisma.sql`AND (v.last_visit_at < ${key}::timestamptz OR v.last_visit_at IS NULL
        OR (v.last_visit_at = ${key}::timestamptz AND ${byName}))`;
}

@Injectable()
export class CustomersRepository {
  /**
   * One page of the list (`limit` + 1 rows, so the caller knows whether more follow), LEFT JOINed to
   * the visit piece of sales — the definition of a finished visit in the caller's read scope (D3).
   */
  async listPage(
    db: Tx,
    filter: CustomerListFilter,
    sort: CustomerSort,
    cursor: ListCursor | null,
    limit: number,
    visits: Prisma.Sql,
  ): Promise<CustomerListRow[]> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT c.id, c.name, c.phone, c.phone_normalized, c.status, c.archived_at, v.last_visit_at,
        coalesce(v.visit_count, 0) AS visit_count, c.created_at::text AS created_key,
        v.last_visit_at::text AS visit_key
      FROM customers c LEFT JOIN (${visits}) AS v ON v.customer_id = c.id
      ${filterOf(filter)} ${afterOf(sort, cursor)}
      ORDER BY ${ORDER[sort]}
      LIMIT ${limit + 1}`;
    return rows.map((row) => listRowSchema.parse(row));
  }

  /** How many customers the filter matches (`total` — AD-LIST-05). */
  async listTotal(db: Tx, filter: CustomerListFilter): Promise<number> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT count(*)::int AS total FROM customers c ${filterOf(filter)}`;
    return z.object({ total: z.number().int() }).parse(rows[0]).total;
  }

  /** A customer of the company with the members of the detail; null when there is none. */
  byId(db: Tx, companyId: string, id: string) {
    return db.customers.findFirst({
      where: { id, company_id: companyId },
      select: {
        id: true,
        name: true,
        phone: true,
        phone_normalized: true,
        notes: true,
        status: true,
        archived_at: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  /** A new row unless the phone exists; true when this call created it. */
  async insertIfNew(
    tx: Tx,
    row: {
      id: string;
      company_id: string;
      name: string;
      phone: string;
      phone_normalized: string;
      at: Date;
    },
  ): Promise<boolean> {
    const inserted = await tx.$executeRaw`
      INSERT INTO customers (id, company_id, name, phone, phone_normalized, status, created_at, updated_at)
      VALUES (${row.id}::uuid, ${row.company_id}::uuid, ${row.name}, ${row.phone},
              ${row.phone_normalized}, ${CustomerStatus.ACTIVE}, ${row.at}, ${row.at})
      ON CONFLICT (company_id, phone_normalized) DO NOTHING`;
    return inserted === 1;
  }

  /** The row of a phone, locked FOR UPDATE until commit. */
  async lockByPhone(
    tx: Tx,
    companyId: string,
    phoneNormalized: string,
  ): Promise<CustomerRow | null> {
    const rows = await tx.$queryRaw<CustomerRow[]>`
      SELECT id, name, phone, phone_normalized, notes, status, archived_at
      FROM customers WHERE company_id = ${companyId}::uuid AND phone_normalized = ${phoneNormalized}
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  findByPhone(db: Tx, companyId: string, phoneNormalized: string): Promise<CustomerRow | null> {
    return db.customers.findUnique({
      where: {
        company_id_phone_normalized: { company_id: companyId, phone_normalized: phoneNormalized },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        phone_normalized: true,
        notes: true,
        status: true,
        archived_at: true,
      },
    });
  }

  summaries(
    db: Tx,
    ids: readonly string[],
  ): Promise<{ id: string; name: string; phone: string }[]> {
    return db.customers.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, phone: true },
    });
  }

  async nameAndPhone(
    db: Tx,
    id: string,
  ): Promise<{ name: string; phone_normalized: string } | null> {
    return db.customers.findUnique({
      where: { id },
      select: { name: true, phone_normalized: true },
    });
  }

  async reactivate(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.customers.update({
      where: { id },
      data: { status: CustomerStatus.ACTIVE, archived_at: null, updated_at: at },
    });
  }

  /** A new row for P3.CUS.03 unless the phone exists; true when this call created it (design D5). */
  async insertNew(
    tx: Tx,
    row: {
      id: string;
      company_id: string;
      name: string;
      phone: string;
      phone_normalized: string;
      notes: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const inserted = await tx.$executeRaw`
      INSERT INTO customers (id, company_id, name, phone, phone_normalized, notes, status, created_at, updated_at)
      VALUES (${row.id}::uuid, ${row.company_id}::uuid, ${row.name}, ${row.phone},
              ${row.phone_normalized}, ${row.notes}, ${CustomerStatus.ACTIVE}, ${row.at}, ${row.at})
      ON CONFLICT (company_id, phone_normalized) DO NOTHING`;
    return inserted === 1;
  }

  /** The customer's row locked FOR UPDATE until commit — the first statement of an edit (design D5). */
  async lockById(tx: Tx, companyId: string, id: string): Promise<LockedCustomerRow | null> {
    const rows = await tx.$queryRaw<LockedCustomerRow[]>`
      SELECT id, name, phone, phone_normalized, notes, status, archived_at, created_at, updated_at
      FROM customers WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  /** Only the members of an edit that are given; `phone` and `phone_normalized` always go together. */
  async updateMembers(
    tx: Tx,
    id: string,
    members: {
      readonly name?: string;
      readonly phone?: string;
      readonly phone_normalized?: string;
      readonly notes?: string | null;
    },
    at: Date,
  ): Promise<void> {
    await tx.customers.update({ where: { id }, data: { ...members, updated_at: at } });
  }

  /** INACTIVE or ACTIVE (P3.CUS.06). */
  async setStatus(tx: Tx, id: string, status: CustomerStatus, at: Date): Promise<void> {
    await tx.customers.update({ where: { id }, data: { status, updated_at: at } });
  }

  /** Hides the customer and keeps the row, the phone and the status (P3.CUS.07). */
  async setArchived(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.customers.update({ where: { id }, data: { archived_at: at, updated_at: at } });
  }
}
