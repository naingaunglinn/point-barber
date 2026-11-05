import { Injectable } from '@nestjs/common';
import type { SettingUser } from '@point/shared';

// What the settings store needs from the people module (ADR-001 rule 1 · add-settings-store design
// D1): the company whose settings are read, the names of the users behind a value or a history
// line, and whether a branch exists. `platform` does not import `people` — people builds on platform —
// so people registers each one at start-up, the way it registers the audit writer's primary-branch
// rule (docs/engineering/module-map.md).

const missing = (port: string): Error =>
  new Error(`${port}: nothing registered (PeopleModule not loaded)`);

/** `id()` — the one company (D-ORG-03); null before the base seed has created it. */
@Injectable()
export class CompanyOfSettings {
  private lookup: (() => Promise<string | null>) | undefined;

  use(lookup: () => Promise<string | null>): void {
    this.lookup = lookup;
  }

  id(): Promise<string | null> {
    if (this.lookup === undefined) throw missing('CompanyOfSettings');
    return this.lookup();
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
