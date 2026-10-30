import { Injectable } from '@nestjs/common';
import type { PermissionEntry } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CatalogueRepository } from '../repositories/catalogue.repository.js';
import { CompanyAdmin } from '../roles/company-admin.js';

// The permission catalogue in the database (D-ROLE-08 · P1-RULE-10 · P1-RULE-12 · ADR-011 · design
// D10): table `permissions` follows packages/shared/definitions/permissions.json. A new code is
// inserted, a changed module / action / description updated, a removed code archived — a row is never
// deleted — and a code back in the file restored. A newly inserted code goes to every company-admin
// role. Runs under the code-tables lock, so two starting processes do not race. A run that changed
// something writes one `permission.sync` row (source 3, no actor); one that changed nothing, none.

export interface SyncResult {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly archived: readonly string[];
  readonly restored: readonly string[];
}

@Injectable()
export class PermissionCatalogue {
  constructor(
    private readonly repository: CatalogueRepository,
    private readonly companyAdmin: CompanyAdmin,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  async sync(tx: Tx, entries: readonly PermissionEntry[]): Promise<SyncResult> {
    await this.repository.lockCodeTables(tx);
    const now = this.clock.now();
    const rows = new Map((await this.repository.permissions(tx)).map((row) => [row.code, row]));
    const inFile = new Set(entries.map((entry) => entry.code));
    const created: { code: string; id: string }[] = [];
    const updated: string[] = [];
    const archived: string[] = [];
    const restored: string[] = [];

    for (const entry of entries) {
      const row = rows.get(entry.code);
      const fields = { module: entry.module, action: entry.action, description: entry.description };
      if (row === undefined) {
        const id = uuidV7(now.getTime());
        await this.repository.insertPermission(tx, { id, code: entry.code, ...fields }, now);
        created.push({ code: entry.code, id });
        continue;
      }
      const changed =
        row.module !== fields.module ||
        row.action !== fields.action ||
        row.description !== fields.description;
      // A reverted removal: the code is back (its reuse for another meaning is a review rule).
      const back = row.archived_at !== null;
      if (changed || back) {
        await this.repository.updatePermission(
          tx,
          row.id,
          { ...(changed ? fields : {}), ...(back ? { archived_at: null } : {}) },
          now,
        );
      }
      if (changed) updated.push(entry.code);
      if (back) restored.push(entry.code);
    }
    for (const row of rows.values()) {
      if (!inFile.has(row.code) && row.archived_at === null) {
        await this.repository.updatePermission(tx, row.id, { archived_at: now }, now);
        archived.push(row.code);
      }
    }

    const result: SyncResult = {
      created: created.map(({ code }) => code),
      updated,
      archived,
      restored,
    };
    if (created.length + updated.length + archived.length + restored.length > 0) {
      this.audit.emitSystem({
        action: 'permission.sync',
        entity_type: 'permissions',
        after: { ...result },
      });
    }
    if (created.length > 0) await this.companyAdmin.grantToAdminRoles(tx, created);
    return result;
  }
}
