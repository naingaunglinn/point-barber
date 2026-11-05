import { Injectable } from '@nestjs/common';
import type { SettingUser } from '@point/shared';

import { GrantSource, type GrantSourceRows } from '../../../common/access/grant-set.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// What the settings store needs from the people module (ADR-001 rule 1 · add-settings-store design
// D1): the company whose settings are read, the names of the users behind a value or a history
// line, whether a branch exists, and the grant rows the maintenance gate decides on (design D9). `platform` does not import `people` — people builds on platform —
// so people registers each one at start-up, the way it registers the audit writer's primary-branch
// rule (docs/engineering/module-map.md).

const missing = (port: string): Error =>
  new Error(`${port}: nothing registered (PeopleModule not loaded)`);

/**
 * `id()` — the one company (D-ORG-03); null before the base seed has created it. The id is kept once
 * it is known: there is one company row, it is never deleted (D-DAT-05) and a restore runs with the
 * API stopped (P8.BAK.03), so it cannot change while the API runs. A null is never kept, and neither is
 * an id read inside a transaction, which might still roll back.
 */
@Injectable()
export class CompanyOfSettings {
  private lookup: (() => Promise<string | null>) | undefined;
  private known: string | undefined;

  use(lookup: () => Promise<string | null>): void {
    this.lookup = lookup;
    this.known = undefined;
  }

  async id(): Promise<string | null> {
    if (this.known !== undefined) return this.known;
    if (this.lookup === undefined) throw missing('CompanyOfSettings');
    const id = await this.lookup();
    if (id !== null && TransactionScope.current() === undefined) this.known = id;
    return id;
  }
}

/** The person names of a user (their employee), as `{ id, name_mm, name_en }`. */
export type NamesOfUsers = (
  userIds: readonly string[],
) => Promise<ReadonlyMap<string, { readonly name_mm: string; readonly name_en: string | null }>>;

/** `of(userIds)` — `updated_by` and `changed_by` (P1.SET.01 · P1.SET.05); a user without one is absent. */
@Injectable()
export class UserNames {
  private names: NamesOfUsers | undefined;

  use(names: NamesOfUsers): void {
    this.names = names;
  }

  async of(userIds: readonly string[]): Promise<ReadonlyMap<string, SettingUser>> {
    if (this.names === undefined) throw missing('UserNames');
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const names = await this.names(ids);
    return new Map(
      [...names].map(([id, name]) => [id, { id, name_mm: name.name_mm, name_en: name.name_en }]),
    );
  }
}

/** `exists(branchId)` — a `branch_id` that is no branch: P1.SET.01 answers `items` = [] (design D5). */
@Injectable()
export class SettingBranches {
  private lookup: ((branchId: string) => Promise<boolean>) | undefined;

  use(lookup: (branchId: string) => Promise<boolean>): void {
    this.lookup = lookup;
  }

  exists(branchId: string): Promise<boolean> {
    if (this.lookup === undefined) throw missing('SettingBranches');
    return this.lookup(branchId);
  }
}

/**
 * The access guard's port GrantSource, as the maintenance gate reads it (design D9): the gate runs in
 * the session guard, before the access guard, and builds the caller's grant set from the same rows.
 * People registers its GrantSource here at start-up.
 */
@Injectable()
export class RegisteredGrantSource extends GrantSource {
  private source: GrantSource | undefined;

  use(source: Pick<GrantSource, 'rowsFor'>): void {
    this.source = source as GrantSource;
  }

  override rowsFor(employeeId: string): Promise<GrantSourceRows> {
    if (this.source === undefined) throw missing('RegisteredGrantSource');
    return this.source.rowsFor(employeeId);
  }
}
