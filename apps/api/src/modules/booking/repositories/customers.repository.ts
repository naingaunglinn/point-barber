import { Injectable } from '@nestjs/common';
import { CustomerStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

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

@Injectable()
export class CustomersRepository {
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

  async reactivate(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.customers.update({
      where: { id },
      data: { status: CustomerStatus.ACTIVE, archived_at: null, updated_at: at },
    });
  }
}
