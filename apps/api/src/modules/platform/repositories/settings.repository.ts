import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { StoredSetting } from '../settings/resolve.js';

// The only Prisma access to `settings` and `settings_history` (ADR-001 rule 1 · add-settings-store
// design D1 / D4 / D6 – D8). `platform` inserts and updates `settings` rows and never deletes one
// (D-DAT-05); `settings_history` is written by the trigger `settings_history_trg` alone. A read made
// inside TransactionRunner.run() goes through that transaction.

const NO_BRANCH = Prisma.sql`'00000000-0000-0000-0000-000000000000'::uuid`;

const writtenRowSchema = z.object({ id: z.uuid(), inserted: z.boolean() });
const idRowSchema = z.object({ id: z.uuid() });
const historyRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid().nullable(),
  old_value: z.unknown(),
  new_value: z.unknown(),
  changed_by_user_id: z.uuid(),
  changed_at: z.date(),
});

export type SettingHistoryRow = z.infer<typeof historyRowSchema>;

/** One value to store: the row of `key` for the company (`branch_id` null) or one branch. */
export interface SettingWrite {
  readonly id: string;
  readonly company_id: string;
  readonly branch_id: string | null;
  readonly key: string;
  readonly value: unknown;
  readonly actor_user_id: string;
  readonly at: Date;
}

const jsonb = (value: unknown) => Prisma.sql`${JSON.stringify(value)}::jsonb`;

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /**
   * The rows of `keys` for the company and, when given, one branch — the one query of design D4
   * (`company_id = $1 AND key = ANY($2) AND (branch_id IS NULL OR branch_id = $3)`).
   */
  async rowsOf(
    companyId: string,
    keys: readonly string[],
    branchId: string | null,
  ): Promise<StoredSetting[]> {
    return this.db.settings.findMany({
      where: {
        company_id: companyId,
        key: { in: [...keys] },
        OR:
          branchId === null
            ? [{ branch_id: null }]
            : [{ branch_id: null }, { branch_id: branchId }],
      },
      select: {
        id: true,
        key: true,
        branch_id: true,
        value: true,
        updated_at: true,
        updated_by_user_id: true,
      },
    });
  }

  /**
   * The upsert of design D6: the first write inserts, a different value updates; the same value
   * changes nothing and returns null. Two writers of one key serialise on `settings_scope_key_uq`.
   */
  async upsert(tx: Tx, write: SettingWrite): Promise<{ id: string; inserted: boolean } | null> {
    const rows = await tx.$queryRaw<unknown[]>`
      INSERT INTO settings (id, company_id, branch_id, key, value, updated_by_user_id, updated_at, created_at)
      VALUES (${write.id}::uuid, ${write.company_id}::uuid, ${write.branch_id}::uuid, ${write.key},
              ${jsonb(write.value)}, ${write.actor_user_id}::uuid, ${write.at}, ${write.at})
      ON CONFLICT (company_id, (COALESCE(branch_id, ${NO_BRANCH})), key)
      DO UPDATE SET value = EXCLUDED.value,
                    updated_by_user_id = EXCLUDED.updated_by_user_id,
                    updated_at = EXCLUDED.updated_at
      WHERE settings.value IS DISTINCT FROM EXCLUDED.value
      RETURNING id, (xmax = 0) AS inserted`;
    return rows[0] === undefined ? null : writtenRowSchema.parse(rows[0]);
  }

  /**
   * The reset of design D7: the row's value becomes the parent value — an update, never an insert or
   * a delete. Null when there is no row or it already holds that value.
   */
  async resetTo(tx: Tx, target: Omit<SettingWrite, 'id'>): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<unknown[]>`
      UPDATE settings
      SET value = ${jsonb(target.value)}, updated_by_user_id = ${target.actor_user_id}::uuid,
          updated_at = ${target.at}
      WHERE company_id = ${target.company_id}::uuid
        AND branch_id IS NOT DISTINCT FROM ${target.branch_id}::uuid
        AND key = ${target.key}
        AND value IS DISTINCT FROM ${jsonb(target.value)}
      RETURNING id`;
    return rows[0] === undefined ? null : idRowSchema.parse(rows[0]);
  }

  /**
   * One page of the history of a company row (`branchId` null) or one branch's row, newest first
   * (design D8): keyset on `(changed_at, id)` after the history row `afterId`; `limit` + 1 rows are
   * read so the caller knows whether a next page exists.
   */
  async historyPage(
    companyId: string,
    key: string,
    branchId: string | null,
    afterId: string | null,
    limit: number,
  ): Promise<SettingHistoryRow[]> {
    const after =
      afterId === null
        ? Prisma.empty
        : Prisma.sql`AND (h.changed_at, h.id) <
            (SELECT c.changed_at, c.id FROM settings_history c WHERE c.id = ${afterId}::uuid)`;
    const rows = await this.db.$queryRaw<unknown[]>`
      SELECT h.id, s.branch_id, h.old_value, h.new_value, h.changed_by_user_id, h.changed_at
      FROM settings_history h
      JOIN settings s ON s.id = h.setting_id
      WHERE s.company_id = ${companyId}::uuid AND s.key = ${key}
        AND s.branch_id IS NOT DISTINCT FROM ${branchId}::uuid
        ${after}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT ${limit + 1}`;
    return rows.map((row) => historyRowSchema.parse(row));
  }

  /** Every key that has a stored row — the start-up check of unknown keys (proposal reading 11). */
  async storedKeys(): Promise<string[]> {
    const rows = await this.prisma.settings.findMany({ distinct: ['key'], select: { key: true } });
    return rows.map((row) => row.key).sort();
  }
}
